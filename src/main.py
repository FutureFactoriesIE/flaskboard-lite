from flask import Flask, render_template, request
import logging
import subprocess as s
import sys
import os
import contextlib
from threading import Lock, Event, Thread

# disable the crazy amount of logging due to all of the requests
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# create flask app
app = Flask(__name__)

# setup working environment
os.chdir('work_dir')

# setup working environment for code to be run
env_code = '\n'.join([
    'import os, sys',
    'sys.path.append(os.getcwd())',  # allows local imports to work correctly
    'del os, sys',
    '\n'
])


class CodeExecutor:
    def __init__(self):
        self.temp_code_path = os.path.abspath('..') + '/temp_code.py'
        self.output_lock = Lock()
        self.output = ''
        self.done = False
        self.kill_event = Event()
        self.stop_event = Event()

    @staticmethod
    def check_for_kill(stop_event: Event, kill_event: Event, proc: s.Popen):
        while not stop_event.is_set():
            if kill_event.is_set():
                proc.kill()
                break

    def execute_code(self, code: str):
        # reset vars
        self.kill_event.clear()
        self.stop_event.clear()
        self.output = ''
        self.done = False
        
        # create temp code outside of work_dir
        with open(self.temp_code_path, 'w') as f:
            f.write(env_code + code)
    
        # execute python script (unbuffered)
        args = [sys.executable, '-u', self.temp_code_path]
        proc = s.Popen(args, text=True, stdout=s.PIPE, stderr=s.STDOUT)

        # setup kill thread
        kill_thread = Thread(target=self.check_for_kill, args=(
            self.stop_event,
            self.kill_event,
            proc
        ))
        kill_thread.start()
    
        # add proc output to queue
        newlines = ['\n', '\r\n', '\r']
        stream = proc.stdout
        with contextlib.closing(stream):
            while True:
                out = []
                last = stream.read(1)
                # Don't loop forever
                if last == '' and proc.poll() is not None:
                    break
                while last not in newlines:
                    # Don't loop forever
                    if last == '' and proc.poll() is not None:
                        break
                    out.append(last)
                    last = stream.read(1)
                out = ''.join(out)
                with self.output_lock:  # add line to output
                    self.output += out + '\n'
                    
        with self.output_lock:
            self.done = True
        self.stop_event.set()  # tell kill thread to stop
        os.remove(self.temp_code_path)

    def to_json(self):
        with self.output_lock:
            return {'output': self.output, 'done': self.done}


code_executor = CodeExecutor()


@app.route('/', methods=['GET'])
def main():
    return render_template('index.html')


# ---------- buttons ----------


@app.route('/evaluate_python', methods=['POST'])
def evaluate_python():
    # get code to run from post request
    code = request.json['data']

    # start code execution
    code_executor.execute_code(code)
    
    return {}


@app.route('/kill_python', methods=['GET'])
def kill_python():
    code_executor.kill_event.set()
    return {}


@app.route('/save_python', methods=['POST'])
def save_python():
    # get json content
    filename = request.json['filename']
    data = request.json['data']

    # create a new file
    with open(filename, 'w') as f:
        f.write(data)

    return {}


@app.route('/upload_files', methods=['POST'])
def upload_files():
    if len(request.files) != 0:
        for filename, file in request.files.items():
            file.save(filename)
    return {}


@app.route('/install_package', methods=['POST'])
def install_package():
    package = request.json['data']
    args = [sys.executable, '-m', 'pip', 'install', '--upgrade', package]
    return {'data': s.check_output(args, text=True)}


# ---------- helper subdirectories ----------


@app.route('/get_files', methods=['GET'])
def get_files():
    return {'data': next(os.walk(os.getcwd()))[2]}


@app.route('/file_contents', methods=['POST'])
def file_contents():
    path = request.json["data"]
    with open(path) as f:
        return {'data': f.read()}


@app.route('/delete_file', methods=['POST'])
def delete_file():
    path = request.json["data"]
    os.remove(path)
    return {}


@app.route('/check_for_output', methods=['GET'])
def check_for_output():
    return code_executor.to_json()


if __name__ == '__main__':
    # run development server
    app.run(host='0.0.0.0', debug=False)

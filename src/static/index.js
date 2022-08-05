/* ---------- CodeMirror init ---------- */
editor = CodeMirror.fromTextArea(
    document.getElementById("command_field"), {
        mode: {
            name: "python",
            version: 3,
            singleLineStringErrors: false,
        },
        lineNumbers: true,
        indentUnit: 4,
        matchBrackets: true,
        keyMap: "sublime",
        autoCloseBrackets: true,
        continueComments: true,
    }
);

editor.setSize(null, "50vh");
editor.setValue("print('Hello world')");


/* ---------- POST and GET request helper functions ---------- */
async function post_json_data(url, input_data) {
    let response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input_data),
    });
    let data = await response.json();
    return data;
}

async function post_file(url, input_data) {
    let response = await fetch(url, {
        method: 'POST',
        body: input_data,
    });
    let data = await response.json();
    return data;
}

async function get_data(url) {
    let response = await fetch(url);
    let data = await response.json();
    return data;
}


/* ---------- functions referenced by HTML buttons ---------- */


function run_kill() {
    if (document.getElementById("run_kill_button").value === "Run") {
        set_kill_button();
        evaluate_python();
    } else {
        disable_run();
        kill_python();
    }
}


function evaluate_python() {
    const command_result = document.getElementById("command_result");

    // update UI
    set_status("Running", "orange");
    clear_output();

    // get code from editor
    let code = editor.getValue();

    // send code in a post request
    let promise = post_json_data("./evaluate_python", {
        "data": code
    });

    const interval = setInterval(function () {
        let get_promise = get_data("./check_for_output");
        get_promise.then((data) => {
            command_result.innerText = data["output"];
            if (data["done"]) {
                clearInterval(interval);
                set_run_button();
                enable_run();
                status_ready();
            }
        });
    }, 100);
}

function kill_python() {
    set_status("Killing", "red");
    get_data("./kill_python");
}

function save_python() {
    let filename = prompt("NOTE: If a file already exists with the same name, it will be overwritten.\n\nFilename to save as (including the extension):");
    if (filename != null) {
        // send file data to Python
        let promise = post_json_data("./save_python", {
            "filename": filename,
            "data": editor.getValue()
        });

        // wait for post response beforing updating DOM
        promise.then((data) => {
            reset_uploaded_files_div();
        });
    }
}

function upload_files() {
    // grab files from form and create FormData with it
    let formData = new FormData();
    for (const file of document.getElementById("python_file").files) {
        formData.append(file.name, file);
    }
    
    // send FormData to Python
    let promise = post_file("./upload_files", formData);

    // wait for post response beforing updating DOM
    promise.then((data) => {
        reset_uploaded_files_div();
    });
}

function open_file() {
    if (confirm("NOTE: This will replace all of your existing code.\n\nAre you sure you want to open this file?")) {
        let promise = post_json_data("./file_contents", {
            "data": get_filename_from_button(this)
        });
        
        promise.then((data) => {
            editor.setValue(data["data"]);
        });
    }
}

function delete_file() {
    if (confirm("NOTE: This operation cannot be reversed.\n\nAre you sure you want to delete this file?")) {
        let promise = post_json_data("./delete_file", {
            "data": get_filename_from_button(this)
        });

        // wait for post response beforing updating DOM
        promise.then((data) => {
            reset_uploaded_files_div();
        });
    }
}

function install_package() {
    set_status("Installing package", "blue");
    disable_run();
    
    let package = document.getElementById("package_name").value;

    // send package name in a get request
    let promise = post_json_data("./install_package", {
        "data": package
    });
    
    promise.then((data) => {
        document.getElementById("install_result").innerText = data["data"];
        status_ready();
        enable_run();
    });
}


/* ---------- uploaded files helper functions ---------- */


function create_file_button(text, title, onclick) {
    var button = document.createElement("button");
    button.className = "file_button";
    button.textContent = text;
    button.title = title;
    button.onclick = onclick;
    return button;
}

function get_filename_from_button(button) {
    const parent_div = button.parentElement;
    for (let i = 0; i < parent_div.childNodes.length; i++) {
        if (parent_div.childNodes[i].className == "file_p") {
            return parent_div.childNodes[i].innerText;
        }
    }
}


/* ---------- uploaded files DOM updating functions ---------- */


function reset_uploaded_files_div() {
    let promise = get_data("./get_files");
    promise.then((data) => {
        let fileNames = data["data"];
        let new_children = Array.from(fileNames, create_file_div);
        document.getElementById("uploaded_files_div").replaceChildren(...new_children);
    });
}

function create_file_div(file_name) {
    // create div for holding a file
    const newDiv = document.createElement("div");
    newDiv.className = "file_div";

    // file name section
    const newP = document.createElement("p");
    newP.innerText = file_name;
    newP.className = "file_p";

    // buttons
    const openButton = create_file_button("\u2191", "Open file", open_file);
    const deleteButton = create_file_button("\u2715", "Delete file", delete_file);

    // add elements to newDiv
    newDiv.appendChild(openButton);
    newDiv.appendChild(deleteButton);
    newDiv.appendChild(newP);

    return newDiv;
}


/* ---------- other ---------- */


function set_status(text, color) {
    const status_indicator = document.getElementById("status_indicator_span");
    status_indicator.innerText = text;
    status_indicator.style.color = color;
}


function status_ready() {
    set_status("Ready", "Green");
}


function disable_run() {
    document.getElementById("run_kill_button").disabled = true;
}


function enable_run() {
    document.getElementById("run_kill_button").disabled = false;
}


function clear_output() {
    document.getElementById("command_result").innerText = "";
}


function set_kill_button() {
    run_kill_button = document.getElementById("run_kill_button");
    run_kill_button.value = "Kill";
    run_kill_button.style.color = "red";
}


function set_run_button() {
    run_kill_button = document.getElementById("run_kill_button");
    run_kill_button.value = "Run";
    run_kill_button.style.color = "black";
}


function on_page_load() {
    reset_uploaded_files_div();
    status_ready();
}
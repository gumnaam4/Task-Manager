
let tasks = JSON.parse(localStorage.getItem("tasks")) || []
let completedTasks = JSON.parse(localStorage.getItem("completed")) || []

function addTask(){

    let taskInput = document.getElementById("taskInput")
    let taskTime = document.getElementById("taskTime")

    let task = {
        text: taskInput.value,
        time: taskTime.value
    }

    tasks.push(task)

    saveData()
    displayTasks()

    taskInput.value=""
}

function displayTasks(){

    let taskList = document.getElementById("taskList")
    taskList.innerHTML=""

    tasks.forEach((task,index)=>{

        let li = document.createElement("li")

        li.innerHTML = `
        ${task.text} (${task.time})
        <div>
        <button onclick="completeTask(${index})">✔</button>
        <button onclick="deleteTask(${index})">❌</button>
        </div>
        `

        taskList.appendChild(li)

    })

    displayCompleted()
}

function completeTask(index){

    completedTasks.push(tasks[index])
    tasks.splice(index,1)

    saveData()
    displayTasks()

}

function deleteTask(index){

    tasks.splice(index,1)

    saveData()
    displayTasks()
}

function displayCompleted(){

    let list = document.getElementById("completedList")
    list.innerHTML=""

    completedTasks.forEach(task=>{

        let li = document.createElement("li")
        li.classList.add("completed")

        li.innerText = task.text + " ("+task.time+")"

        list.appendChild(li)

    })
}

function saveData(){

    localStorage.setItem("tasks",JSON.stringify(tasks))
    localStorage.setItem("completed",JSON.stringify(completedTasks))

}

displayTasks()


// Midnight reset logic

function checkMidnight(){

    let lastDate = localStorage.getItem("date")

    let today = new Date().toDateString()

    if(lastDate !== today){

        tasks = []

        localStorage.setItem("date",today)
        saveData()
        displayTasks()
    }

}

checkMidnight()
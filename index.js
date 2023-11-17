// const ws = require('ws');
import { Server } from "socket.io"
import express from 'express'
import path from 'path'
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3500; 
const hostname = '127.0.0.1';
const ADMIN = "Admin"

const app = express();

app.use(express.static(path.join(__dirname, 'public')))

const expressServer = app.listen(PORT, hostname, () => {
    console.log(`Server is running at http://${hostname}:${PORT}`);
})

//state
const userState = {
    users: [],
    setUsers: function(newUsersArray){
        this.users = newUsersArray;
    }
}

const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3500", "http://127.0.0.1:3500"]
    }
})

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    //upon connection - only to user connected
    socket.emit('message', buildMsg(ADMIN, "Welcome To ChatKaro"))

    socket.on('enterRoom', ({name, room}) => {
        //leave previous room
        const prevRoom = getUser(socket.id)?.room
        if(prevRoom){
            socket.leave(prevRoom);
            io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`));
        }

        const user = activateUser(socket.id, name, room)
        
        //cannot update previous room users list until after the state update in activate user
        if(prevRoom){
            io.of(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        //join room
        socket.join(user.room)

        //to user who joined
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room`));

        //to all others
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} joined the room`))

        //update user list for room
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })

        //update rooms list for everyone
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    //when user disconnects - to all others
    socket.on('disconnect', () => {
        const user = getUser(socket.id);
        userLeavesApp(socket.id);
        if(user){
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`));
            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })
            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }
        console.log(`User ${socket.id} disconnected`);
    })

    //listening for message event
    socket.on('message', ({name, text}) => {
        const room = getUser(socket.id)?.room;
        if(room){
            io.to(room).emit('message', buildMsg(name, text));
        }
    })

    //listen for activity
    socket.on('activity', (name)=> {
        const room = getUser(socket.id)?.room;
        if(room){
            socket.broadcast.to(room).emit('activity', name);
        }
    })
})

function buildMsg(name, text){
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date)
    }
}

//User functions
function activateUser(id, name, room){
    const user = {id, name, room}
    const otherUsers = userState.users.filter(user => user.id !== id);
    userState.setUsers([...otherUsers, user]);
    return user;
}

function userLeavesApp(id){
    const otherUsers = userState.users.filter(user => user.id !== id);
    userState.setUsers([...otherUsers]);
}

function getUser(id){
    return userState.users.find(user => user.id === id);
}

function getUsersInRoom(room){
    return userState.users.filter(user => user.room === room)
}

function getAllActiveRooms(){
    return Array.from(new Set(userState.users.map(user => user.room)));
}
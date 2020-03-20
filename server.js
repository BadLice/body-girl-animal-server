var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const shortid = require('shortid');
const { uuid } = require('uuidv4');

let games = [];
let sockets = []
let users = [];

/*
::::hands states::::
playing
waiting
confirmed
submitted
*/

// for (let i = 0; i < 10; i++) {
//     generateGame();
// }


app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', socket => {
    // log.info('a user connected ' + socket.id)

    socket.on('reqUserId', () => {
        socket.emit('getUserId', generateNewUser(socket.id));
    });

    socket.on('reqGameExists', gameId => {
        socket.emit('getGameExists', games.findIndex(game => game.id === gameId) !== -1);
    });

    socket.on('hereHands', (data) => {
        if (data.hands.length !== 0) {
            let hands = getHands(data.gameId, data.userId);
            setHands(data.gameId, data.userId, data.hands)        
            console.log(data.hands[data.hands.length-1].inputs);
            socket.emit('getHands', getHands(data.gameId, data.userId));
            console.log(getHands(data.gameId, data.userId)[getHands(data.gameId, data.userId).length - 1].inputs)
        }
    });

    socket.on('reqGames', () => {
        socket.emit('getGames', getFilteredGamesForClient());
    })

    socket.on('reqJoinGame', gameId => {
        let success = false;
        let game = getGame(gameId);
        let userId = getUserId(socket.id);
        if (game && !userIsInGame(userId, game)) {
            let username = getUserName(userId);

            // if (userIsInGame(userId,game)) { //sync old user with actual game hands
            //     syncOldUserInGame(game,userId);
            //     success = true;
            // } else { //new game for user

            generateNewGameUser(game, userId, username);
            success = true;
            // }    
            log.info(socket.id + ' joined ' + game.id)
        }
        socket.emit('getJoinGame', success);
        if (success) {
            updateUsersConnectedToGame(game);
        }
    })

    socket.on('reqCreateGame', () => {
        const gameId = generateGame(socket.id);
        socket.emit('getCreateGame', gameId);

        updateUsersConnectedToGame(getGame(gameId));
        updateGamesToSockets();
    })

    socket.on('reqQuitGame', () => {
        quitUserFromGame(socket);
    })

    socket.on('reqColumns', gameId => {
        socket.emit('getColumns', getGame(gameId).columns);
    })

    socket.on('reqGameStarted', gameId => {
        let game = getGame(gameId);
        if (game) {
            socket.emit('getGameStarted', game.started);
        }
    })

    socket.on('reqHands', data => {
        socket.emit('getHands', getHands(data.gameId, data.userId));
    })

    socket.on('reqSaveUsername', user => {
        user.socketId = socket.id;
        users[users.findIndex(u => user.id === u.id)] = user;
        socket.emit('getSaveUsername', true);
    })

    socket.on('reqUsername', userId => {
        let username = getUserName(userId, socket.id) || generateNewUser(socket.id, userId).name;
        socket.emit('getUsername', username);
    })

    socket.on('disconnect', () => {
        // removeUserFromGames(socket.id);
        quitUserFromGame(socket);
        sockets = [...sockets].filter(s => s.id !== socket.id);
    });

    socket.on('startGame', (data) => {
        let game = getGame(data.gameId);
        game.columns = data.columns;
        game.name = data.name;
        game.started = true;
        game.hands++;
        let character = genCharacter();
        let inputs = [];
        game.columns.forEach(col => {
            inputs.push({
                value: '',
                score: 0,
            })
        })
        game.users.map(user => {
            user.hands.push({
                id: uuid(),
                character: character,
                inputs: inputs,
                state: 'playing',
            });
            return user;
        })

        log.info('Started game ' + game.id);

        game.users.forEach(user => {

            let s = getSocket(user.id);
            if (s) {
                s.emit('getGameStarted', game.started);
                socket.emit('getHands', getHands(data.gameId, data.userId));
            }
        })
    });

    sockets.push(socket);
});

const quitUserFromGame = (socket) => {
    removeUserFromGames(socket.id);
    removeEmptyGames();
    log.info(socket.id + ' quitted')
    socket.emit('getQuitGame');
}

let updateGamesToSockets = () => {
    sockets.forEach(socket => {
        socket.emit('getGames', getFilteredGamesForClient());
    })
}

let getFilteredGamesForClient = () => {
    let gm = [...games]
    gm = gm.filter(g => g.users.length !== 0);

    gm.map(game => { //serve to client also the usernames
        game.users = [...game.users].map(u => {
            u.name = getUserName(u.id);
            return u
        })
        return game
    })

    return gm;
}

let getSocket = userId => {
    let result = null;
    let index = users.findIndex(user => user.id === userId);
    if (index !== -1) {
        let socketId = users[index].socketId;
        let indexSocket = sockets.findIndex(s => s.id === socketId);
        if (indexSocket !== -1) {
            result = sockets[indexSocket];
        }
    }
    return result;
}

let generateGame = (socketId) => {
    let userId = getUserId(socketId);
    let game = {
        id: shortid.generate(),
        timer: 10,
        name: null,
        started: false,
        hand: 0,
        users: [],
        columns: [],
    }
    games.push(game);
    generateNewGameUser(game, userId, getUserName(userId));
    log.info('Created game: ' + game.id)
    return game.id;
}

let updateUsersConnectedToGame = (game) => {
    game.users.forEach(user => {
        let s = getSocket(user.id);
        let users = [...game.users];

        users = users.map(user => {
            let score = user.hands.reduce((acc, hand) => acc + hand.inputs.reduce((a, inn) => a + inn.score), 0);
            user.score = score;
            return user;
        });

        if (s) {
            s.emit('getUsersConnected', users);
        }
    })
}

let generateNewUser = (socketId, oldId) => {
    let id = oldId || uuid();
    let user = { id: id, name: shortid.generate(), socketId: socketId }
    users.push(user);
    log.info('Generated new user ' + user.id);
    return user;
}

let getHands = (gameId, userId) => {
    let user = getGameUser(gameId, userId)
    return user ? user.hands : [];
}

let getGameUser = (gameId, userId) => {
    let index = getGame(gameId).users.findIndex(u => u.id == userId);
    if (index !== -1) {
        return getGame(gameId).users[index];
    } else {
        return null;
    }
}

let setHands = (gameId, userId, value) => {
    let user = getGameUser(gameId, userId)
    user.hands = value;
}
let getGame = gameId => {
    let index = games.findIndex(g => g.id === gameId)
    if (index !== -1) {
        return games[index];
    } else {
        return null;
    }
}

let getUserId = (socketId) => {
    let index = users.findIndex(u => u.socketId === socketId);
    return index === -1 ? null : users[index].id;
}

let removeUserFromGames = (socketId) => {
    let userId = getUserId(socketId);
    if (userId) {
        games = games.map(game => {
            let users = [...game.users]
            let wasInGame = users.findIndex(u => u.id === userId) !== -1;
            users = users.filter(u => u.id !== userId);
            game.users = users;
            if (wasInGame) {
                game.users.forEach(user => {
                    let s = getSocket(user.id);
                    if (s) {
                        s.emit('getUsersConnected', game.users)
                    }
                });
            }
            return game;
        });
    }
}

let getUserName = (userId, socketId) => {
    let index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
        if (socketId) {
            users[index].socketId = socketId;
        }
        return users[index].name;
    } else {
        return null;
    }
}

let syncOldUserInGame = (game, userId, username) => {
    let hands = getGameUser(game.id, userId).hands;
    for (let i = 0; i < (game.hand + 1) - hands.length; i++) {

        let inputs = [];
        for (let j = 0; j < game.columns.length; j++) {
            inputs.push({
                value: '',
                score: 0,
            })
        }

        hands.push({
            id: uuid(),
            character: 'N/A',
            inputs: inputs,
            state: 'submitted',
        })
    }

    game.users.push({
        id: userId,
        name: username,
        hands: hands,
    });
}

let generateNewGameUser = (game, userId, username) => {
    let hands = [];
    for (let i = 0; i < game.hand; i++) {

        let inputs = [];
        for (let j = 0; j < game.columns.length; j++) {
            inputs.push({
                value: '',
                score: 0,
            })
        }

        hands.push({
            id: uuid(),
            character: 'N/A',
            inputs: inputs,
            state: 'submitted',
        })
    }

    game.users.push({
        id: userId,
        name: username,
        hands: hands,
    });
}

let userIsInGame = (userId, game) => {
    return game.users.findIndex(u => u.id === userId) !== -1;
}

log = {
    err: txt => console.log('\x1b[31m%s\x1b[0m%s', 'ERROR: ', txt),
    info: txt => console.log('\x1b[32m%s\x1b[0m', 'INFO: ', txt),
    warn: txt => console.log('\x1b[33m%s\x1b[0m', 'WARN: ', txt),
    error: txt => console.log('\x1b[31m%s\x1b[0m', 'ERROR: ', txt),
}


const removeEmptyGames = () => {
    let g = [...games];
    g.filter(game => game.users.length !== 0);
    games = g;
    log.warn("Games cleared");
}

const genCharacter = () => {
    let length = 1;
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

setInterval(() => {
    games.map(game => {
        if (game.started && game.timer > 0) {
            game.timer--;

            game.users.forEach(user => {
                let s = getSocket(user.id);
                if (s) {
                    s.emit('syncTimer', game.timer)
                }
            })
        }

        if (game.timer <= 0) {
            game.users.map(user => {
                let socket = getSocket(user.id);
                let state = user.hands[user.hands.length - 1].state;
                if (state === 'playing' || state === 'waiting') {
                    state = 'confirmed';
                } else {
                    state = 'submitted';
                }
                user.hands[user.hands.length - 1].state = state;
                game.timer = 30;

                if (socket) {
                    socket.emit('giveHands');
                }
            })
        }
    })
}, 1000);


//create fake game
// games.push({
//     id: shortid.generate(),
//     name: 'prova',
//     hand: 7,
//     users: [{
//         id: '525dd6d3-8fb0-4988-9d87-d0d76b8f23e6',
//         hands: [
//             {
//                 id: '1',
//                 character: 'A',
//                 inputs: [
//                     {
//                         value: 'Alex',
//                         score: 10,
//                     },
//                     {
//                         value: 'Aspirapolvere',
//                         score: 5,
//                     }, {
//                         value: 'Avellino',
//                         score: 5,
//                     }, {
//                         value: 'Armando Maradona',
//                         score: 10,
//                     }, {
//                         value: 'A spasso nel tempo',
//                         score: 0,
//                     }, {
//                         value: 'Assassins creed',
//                         score: 0,
//                     },
//                 ],
//                 state: 'submitted',
//             },
//             {
//                 id: '2',
//                 character: 'S',
//                 inputs: [
//                     {
//                         value: 'Sofia',
//                         score: 10,
//                     },
//                     {
//                         value: 'Salsedine',
//                         score: 5,
//                     }, {
//                         value: 'Seregno',
//                         score: 5,
//                     }, {
//                         value: 'Signor gianfranco',
//                         score: 10,
//                     }, {
//                         value: 'Sanremo',
//                         score: 0,
//                     }, {
//                         value: 'Silent Hill',
//                         score: 0,
//                     },
//                 ],
//                 state: 'playing',
//             }
//         ]
//     },
//     {
//         id: 'bb',
//         hands: [],
//     }, {
//         id: 'cc',
//         hands: [],
//     }, {
//         id: 'dd',
//         hands: [],
//     }
//     ],
//     columns: [
//         'nomi',
//         'cose',
//         'città',
//         'vip',
//         'film',
//         'giochi',
//     ],

// })




http.listen(15519, () => {
    log.warn('Server started, listening on port 15519...');
});


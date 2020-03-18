var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const shortid = require('shortid');
const { uuid } = require('uuidv4');

let games = [];

let users = [{
    id: '525dd6d3-8fb0-4988-9d87-d0d76b8f23e6',
    name: 'Alex',
},
{
    id: 'bb',
    name: 'Anna',
},
{
    id: 'cc',
    name: 'Ari',
},
{
    id: 'dd',
    name: 'Dado',
},
];

let generateGame = () => {
    games.push({
        id: shortid.generate(),
        name: null,
        users: [],
        columns: [],
        hands: []
    })
}

for (let i = 0; i < 10; i++) {
    generateGame();
}

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
    console.log('a user connected ' + socket.id)

    socket.on('reqUserId', () => {
        socket.emit('getUserId', uuid());
    });

    socket.on('reqGames', () => {
        let gm = [...games]
        gm = gm.filter(g => g.name !== null);

        gm.map(game => { //serve to client also the usernames
            game.users = [...game.users].map(u => {
                u.name = getUserName(u.id);
                return u
            })
            return game
        })

        socket.emit('getGames', gm);
    })

    socket.on('reqJoinGame', gameId => {
        socket.emit('getJoinGame', games.findIndex(g => g.id === gameId) !== -1);
    })

    socket.on('reqColumns', gameId => {
        socket.emit('getColumns', getGame(gameId).columns);
    })

    socket.on('reqHands', data => {
        socket.emit('getHands', getHands(data.gameId, data.userId));
    })

    socket.on('reqSaveUsername', user => {
        users[users.findIndex(u => user.id === u.id)] = user;
        socket.emit('getSaveUsername', true);
    })

    socket.on('reqUsername', userId => {
        socket.emit('getUsername', getUserName(userId));
    })
});

let getHands = (gameId, userId) => {
    return getGameUser(gameId, userId).hands;
}

let getGameUser = (gameId, userId) => {
    let index = getGame(gameId).users.findIndex(u => u.id == userId);
    if (index !== -1) {
        return getGame(gameId).users[index];
    } else {
        return null;
    }
}

let getGame = gameId => {
    let index = games.findIndex(g => g.id === gameId)
    if (index !== -1) {
        return games[index];
    } else {
        return null;
    }
}

let getUserName = userId => {
    let index = users.findIndex(u => u.id == userId);
    if (index !== -1) {
        return users[index].name;
    } else {
        return null;
    }
}


//create fake game
games.push({
    id: shortid.generate(),
    name: 'prova',
    users: [{
        id: '525dd6d3-8fb0-4988-9d87-d0d76b8f23e6',
        hands: [
            {
                id: '1',
                character: 'A',
                inputs: [
                    {
                        value: 'Alex',
                        score: 10,
                    },
                    {
                        value: 'Aspirapolvere',
                        score: 5,
                    }, {
                        value: 'Avellino',
                        score: 5,
                    }, {
                        value: 'Armando Maradona',
                        score: 10,
                    }, {
                        value: 'A spasso nel tempo',
                        score: 0,
                    }, {
                        value: 'Assassins creed',
                        score: 0,
                    },
                ],
                state: 'submitted',
            },
            {
                id: '2',
                character: 'S',
                inputs: [
                    {
                        value: 'Sofia',
                        score: 10,
                    },
                    {
                        value: 'Salsedine',
                        score: 5,
                    }, {
                        value: 'Seregno',
                        score: 5,
                    }, {
                        value: 'Signor gianfranco',
                        score: 10,
                    }, {
                        value: 'Sanremo',
                        score: 0,
                    }, {
                        value: 'Silent Hill',
                        score: 0,
                    },
                ],
                state: 'playing',
            }
        ]
    },
    {
        id: 'bb',
        hands: [],
    }, {
        id: 'cc',
        hands: [],
    }, {
        id: 'dd',
        hands: [],
    }
    ],
    columns: [
        'Lettera',
        'nomi',
        'cose',
        'città',
        'vip',
        'film',
        'giochi',
    ],

})




http.listen(15519, function () {
    console.log('listening on *:15519');
});


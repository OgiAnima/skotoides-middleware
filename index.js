// index.js (root)

const express = require('express')
const cors = require('cors')
require('dotenv').config()

const chatRoute = require('./api/chat')   // <-- This file is the API

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())

app.use('/api', chatRoute)   // <-- /api/chat is now available

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

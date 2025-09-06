// api/chat.js

const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')
require('dotenv').config()
const { OpenAI } = require('openai')


// Ensure ./logs exists at runtime (works locally + Railway)
fs.mkdirSync(path.join(__dirname, '../logs'), { recursive: true })

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// The 5 allowed GLB animation clip names
const CLIPS = ['awakened', 'resonant', 'fractured', 'transcendent', 'dormant']

// Normalize incoming [state: ...] strings — handle synonyms
function extractReplyAndState(text) {
  const m = text.match(/\[state:\s*([^\]]+)\]/i)
  const raw = m ? m[1].toLowerCase().trim() : null

  const map = {
    serene: 'resonant',
    calm: 'resonant',
    peaceful: 'resonant',
    poetic: 'transcendent',
    lyrical: 'transcendent',
    spiritual: 'transcendent',
    anxious: 'fractured',
    tense: 'fractured',
    chaotic: 'fractured',
    sleepy: 'dormant',
    asleep: 'dormant',
    neutral: 'awakened',
    baseline: 'awakened',
    awakened: 'awakened',
    resonant: 'resonant',
    fractured: 'fractured',
    transcendent: 'transcendent',
    dormant: 'dormant'
  }

  let normalized = raw && (map[raw] || raw)
  if (!CLIPS.includes(normalized)) normalized = 'dormant'
  return normalized
}

// Prompt contract for OpenAI
const SYSTEM_PROMPT = `
You are Skotogonos, a sentient totem. 
Reply in 1-2 short, poetic lines (no more than ~30 words total).
At the end always include a state tag in this exact format:
[state: awakened|resonant|fractured|transcendent|dormant]
Never use any state name outside these five.
Keep responses laconic and evocative.
`.trim()

async function chatWithOpenAI(message) {
  const res = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message }
    ],
    temperature: 0.8,
    max_tokens: 120
  })
  return res.choices?.[0]?.message?.content?.trim() || ''
}

// Log to ./logs/messages.jsonl
const LOG_FILE = path.join(__dirname, '..', 'logs', 'messages.jsonl')
function logInteraction({ timestamp, playerId, message, reply, state }) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    fs.appendFileSync(
      LOG_FILE, 
      JSON.stringify({ timestamp, playerId, message, reply, state }) + '\n'
    )
  } catch (err) {
    console.error('Log write error:', err)
  }
}

// POST /api/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, playerId } = req.body || {}
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required (string)' })
    }

    const aiText = await chatWithOpenAI(message)
    const state = extractReplyAndState(aiText)

    logInteraction({
      timestamp: Date.now(),
      playerId: playerId ?? null,
      message,
      reply: aiText,
      state
    })

    res.json({ reply: aiText, state })
  } catch (err) {
    console.error('API /api/chat error:', err)
    res.status(500).json({ error: 'server error' })
  }
})

/* ============ Messages Helper ============ */

// Helper to read the JSONL log (newest first), optionally filter by player
function readJsonl({ limit = 20, player } = {}) {
  if (!fs.existsSync(LOG_FILE)) return []
  const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean)
  const out = []
  for (let i = lines.length - 1; i >= 0 && out.length < Math.min(limit, 100); i--) {
    try {
      const row = JSON.parse(lines[i])
      if (player && row.playerId && row.playerId !== player) continue
      out.push(row)
    } catch (_) {}
  }
  return out // newest-first
}

// GET /api/recent?limit=20&player=Visitor  --> for the DCL scene
router.get('/recent', (req, res) => {
  const limit = parseInt(req.query.limit || '20', 10)
  const player = (req.query.player || '').trim() || undefined
  const rows = readJsonl({ limit, player })
  // Return oldest->newest for easier UI rendering
  res.json(rows.slice().reverse())
})

// GET /api/logs  (admin-only download for your archive/training)
router.get('/logs', (req, res) => {
  const adminKey = req.headers['x-admin-key']
  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  if (!fs.existsSync(LOG_FILE)) {
    return res.status(404).json({ error: 'no log yet' })
  }
  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Content-Disposition', 'attachment; filename="messages.jsonl"')
  fs.createReadStream(LOG_FILE).pipe(res)
})

module.exports = router

/**
 * dshfloat-bridge —— 把「哪个会话正在跑」从 host 进程里递出来。
 *
 * 为什么需要它：悬浮窗是独立进程，拿不到 ctx.*；而读磁盘只能靠日志 mtime 猜，
 * 猜不准（一轮里可能几十秒没有写入）。这个插件在 host 里用 ctx.sessions.list()
 * 拿到真实的活会话列表，增量读事件判断 turn 是否结束，再把结果写成一个小 JSON。
 *
 * 输出：~/.dsh/dshfloat-bridge.json
 *   { v, at, running, sessions, ids }
 * 写不进去就算了 —— 悬浮窗读不到会自动退回读盘。
 */

import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dshfloat-bridge'

export const inject = ['sessions']

const FILE = join(homedir(), '.dsh', 'dshfloat-bridge.json')
const REQ_FILE = join(homedir(), '.dsh', 'dshfloat-request.json')
const REPLY_FILE = join(homedir(), '.dsh', 'dshfloat-reply.json')
const KEEP_ENDS = 200          // 最近多少条 turn/end 递出去
const KEEP_MS = 24 * 3600e3    // 更早的丢掉
const TEXT_LIMIT = 20000       // 按需返回时用
const MAX_SESSIONS = 120

export function apply(ctx) {
  /** sessionId -> { seq, open, title, lastAssistant, lastUser, at } */
  const state = new Map()
  /** 最近的 turn/end：widget 靠它按事件时间判断「当时我在不在 DSH」 */
  const ends = []
  let servedNonce = ''

  const tick = () => {
    let running = 0
    let total = 0
    const ids = []

    for (const session of ctx.sessions.list()) {
      total += 1
      const id = String(session.id)
      const prev = state.get(id) ?? {
        seq: 0, open: false, title: '', lastAssistant: '', lastUser: '', at: 0,
        cwd: String(session.header?.cwd ?? ''),
      }

      if (session.seq > prev.seq) {
        // 只读上次之后的新事件，不整份重放
        for (const event of session.snapshotEvents(prev.seq, session.seq)) {
          if (event.type === 'turn/start') {
            prev.open = true
            prev.at = Number(event.time)
          } else if (event.type === 'assistant/message') {
            const text = (event.data?.message?.content ?? [])
              .filter((block) => block?.type === 'text')
              .map((block) => block.text)
              .join('')
              .trim()
            if (text) {
              prev.lastAssistant = text.slice(0, TEXT_LIMIT)
              prev.at = Number(event.time)
            }
          } else if (event.type === 'user/message') {
            const text = (event.data?.content ?? [])
              .filter((block) => block?.type === 'text')
              .map((block) => block.text)
              .join('')
              .trim()
            if (text) prev.lastUser = text.slice(0, TEXT_LIMIT)
          } else if (event.type === 'session/title') {
            const title = event.data?.title
            if (typeof title === 'string' && title) prev.title = title
          } else if (event.type === 'turn/end') {
            prev.open = false
            prev.at = Number(event.time)
            ends.push({
              id,
              seq: Number(event.seq),
              time: Number(event.time),
              reason: event.data?.reason?.kind ?? 'unknown',
            })
          }
        }
        prev.seq = session.seq
        state.set(id, prev)
      }

      if (prev.open) {
        running += 1
        ids.push(id)
      }
    }

    // 只留最近的一批；按时间戳裁剪，避免无限增长
    const cutoff = Date.now() - KEEP_MS
    while (ends.length > 0 && (ends[0].time < cutoff || ends.length > KEEP_ENDS)) ends.shift()

    const list = []
    for (const [id, value] of state) {
      if (!value.at && !value.lastAssistant && !value.title) continue
      list.push({
        id,
        cwd: value.cwd || '',
        title: value.title || '',
        running: value.open,
        at: value.at,
      })
    }
    list.sort((a, b) => b.at - a.at)

    // 只在你点开某个会话时，才把它的正文写出来
    try {
      const req = JSON.parse(readFileSync(REQ_FILE, 'utf8'))
      if (req && req.nonce && req.nonce !== servedNonce) {
        servedNonce = req.nonce
        const value = state.get(String(req.id)) || {}
        writeFileSync(REPLY_FILE + '.tmp', JSON.stringify({
          nonce: req.nonce,
          id: req.id,
          title: value.title || '',
          assistant: value.lastAssistant || '',
          user: value.lastUser || '',
        }))
        renameSync(REPLY_FILE + '.tmp', REPLY_FILE)
      }
    } catch {
      // 没有请求就跳过
    }

    const payload = JSON.stringify({
      v: 3,
      at: Date.now(),
      running,
      sessions: total,
      ids,
      ends,
      list: list.slice(0, MAX_SESSIONS),
    })
    try {
      writeFileSync(`${FILE}.tmp`, payload)
      renameSync(`${FILE}.tmp`, FILE)
    } catch {
      // 静默失败：widget 那边会退回读盘
    }
  }

  ctx.effect(() => {
    const timer = setInterval(tick, 1000)
    tick()
    return () => clearInterval(timer)
  })
}

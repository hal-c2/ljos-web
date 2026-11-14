/* Hand-written tokenizers for tokens that lezer's built-in tokenizer
   cannot express. Forked from @lezer/javascript 1.5.6 (MIT); the JSX
   tokenizer is gone with JSX. */

import {ExternalTokenizer, ContextTracker, type InputStream} from "@lezer/lr"
import {uiLiteralOpen, insertSemi, noSemi, noSemiType, incdec, incdecPrefix, questionDot,
        spaces, newline, BlockComment, LineComment} from "./parser.terms.js"

const space = [9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200,
               8201, 8202, 8232, 8233, 8239, 8287, 12288]

const braceR = 125, semicolon = 59, slash = 47, star = 42, plus = 43, minus = 45,
      question = 63, dot = 46, bracketL = 91

export const trackNewline = new ContextTracker<boolean>({
  start: false,
  shift(context, term) {
    return term == LineComment || term == BlockComment || term == spaces ? context : term == newline
  },
  strict: false
})

export const insertSemicolon = new ExternalTokenizer((input, stack) => {
  let {next} = input
  if (next == braceR || next == -1 || stack.context)
    input.acceptToken(insertSemi)
}, {contextual: true, fallback: true})

export const noSemicolon = new ExternalTokenizer((input, stack) => {
  let {next} = input, after
  if (space.indexOf(next) > -1) return
  if (next == slash && ((after = input.peek(1)) == slash || after == star)) return
  if (next != braceR && next != semicolon && next != -1 && !stack.context)
    input.acceptToken(noSemi)
}, {contextual: true})

export const noSemicolonType = new ExternalTokenizer((input, stack) => {
  if (input.next == bracketL && !stack.context) input.acceptToken(noSemiType)
}, {contextual: true})

export const operatorToken = new ExternalTokenizer((input, stack) => {
  let {next} = input
  if (next == plus || next == minus) {
    input.advance()
    if (next == input.next) {
      input.advance()
      let mayPostfix = !stack.context && stack.canShift(incdec)
      input.acceptToken(mayPostfix ? incdec : incdecPrefix)
    }
  } else if (next == question && input.peek(1) == dot) {
    input.advance(); input.advance()
    if (input.next < 48 || input.next > 57) // No digit after
      input.acceptToken(questionDot)
  }
}, {contextual: true})

const braceL = 123, colon = 58, backslash = 92, quoteD = 34, quoteS = 39

// The offset past the spaces and comments from `i` on, which the
// grammar skips between any two tokens; -1 at an unclosed comment.
function trivia(input: InputStream, i: number): number {
  for (;;) {
    let ch = input.peek(i)
    if (space.indexOf(ch) > -1) { i++; continue }
    if (ch != slash) return i
    let after = input.peek(i + 1)
    if (after == slash) {
      for (i += 2; (ch = input.peek(i)) != 10 && ch != -1; i++) {}
    } else if (after == star) {
      for (i += 2;; i++) {
        ch = input.peek(i)
        if (ch == -1) return -1
        if (ch == star && input.peek(i + 1) == slash) { i += 2; break }
      }
    } else return i
  }
}

export const uiLiteral = new ExternalTokenizer((input, stack) => {
  if (input.next != braceL || !stack.canShift(uiLiteralOpen)) return
  let i = trivia(input, 1), ch
  if (i < 0) return
  ch = input.peek(i)
  if (ch != quoteD && ch != quoteS) return
  let quote = ch
  for (i++;; i++) {
    ch = input.peek(i)
    if (ch == -1 || ch == 10) return
    if (ch == backslash) { i++; continue }
    if (ch == quote) break
  }
  i = trivia(input, i + 1)
  if (i > 0 && input.peek(i) == colon) input.acceptToken(uiLiteralOpen, 1)
}, {contextual: true})

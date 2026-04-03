import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const logPath = path.join(process.cwd(), 'public', 'python_log.txt')
    if (fs.existsSync(logPath)) {
      const logs = fs.readFileSync(logPath, 'utf8')
      return new NextResponse(logs, {
        headers: { 'Content-Type': 'text/plain' }
      })
    }
    return new NextResponse('Log file not found yet. Python is either still starting or hasn\'t written logs.', {
      headers: { 'Content-Type': 'text/plain' }
    })
  } catch (error: any) {
    return new NextResponse(`Error reading log: ${error.message}`, {
      headers: { 'Content-Type': 'text/plain' },
      status: 500
    })
  }
}

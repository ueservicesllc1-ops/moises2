'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Send, User, MessageSquare } from 'lucide-react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function ContactoPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [feedback, setFeedback] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFeedback('')

    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setFeedback('Completa todos los campos.')
      return
    }

    setIsSending(true)
    try {
      await addDoc(collection(db, 'contact_messages'), {
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        status: 'new',
        source: 'contact_page',
        createdAt: serverTimestamp(),
      })

      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
      setFeedback('Mensaje enviado correctamente. Te responderemos pronto.')
    } catch (error) {
      console.error('Error guardando mensaje de contacto:', error)
      setFeedback('No se pudo enviar el mensaje. Intenta de nuevo.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#060608] px-4 py-14 text-zinc-200 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-600/15 blur-3xl" />
        <div className="absolute left-0 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <Link
          href="/"
          className="mobile-touch-target inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-white/30 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Link>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#0d0d14]/95 p-5 shadow-2xl ring-1 ring-white/5 backdrop-blur sm:p-7">
            <h1 className="text-3xl font-black tracking-tight text-white">Contacto</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Escribe tu mensaje y lo veremos en administración.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="group">
                  <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <User className="h-3.5 w-3.5" />
                    Nombre
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mobile-touch-target w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                    placeholder="Tu nombre"
                  />
                </label>

                <label className="group">
                  <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Mail className="h-3.5 w-3.5" />
                    Correo
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mobile-touch-target w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                    placeholder="tu@email.com"
                  />
                </label>
              </div>

              <label className="group block">
                <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Asunto
                </span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mobile-touch-target w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                  placeholder="Motivo del contacto"
                />
              </label>

              <label className="group block">
                <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Mensaje
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={7}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                  placeholder="Escribe tu mensaje..."
                />
              </label>

              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="submit"
                  disabled={isSending}
                  className="mobile-touch-target inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {isSending ? 'Enviando...' : 'Enviar mensaje'}
                </button>
                <p className="text-xs text-zinc-500">support@judith.life</p>
              </div>

              {feedback && (
                <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200">
                  {feedback}
                </p>
              )}
            </form>
        </section>
      </div>
    </main>
  )
}

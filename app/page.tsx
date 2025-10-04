'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { 
  Music, 
  Search,
  Plus,
  ChevronDown,
  User,
  Volume2,
  LogOut,
  Cloud,
  Play,
  Trash2,
  Zap,
  Target,
  Repeat,
  BarChart3,
  VolumeX
} from 'lucide-react'
import NewSongUpload from '@/components/NewSongUpload'
import ConnectionStatus from '@/components/ConnectionStatus'
import SimpleMixer from '@/components/SimpleMixer'
import ProfessionalDAW from '@/components/ProfessionalDAW'
import ProfessionalMixer from '@/components/ProfessionalMixer'
import { getUserSongs, subscribeToUserSongs, deleteSong, Song } from '@/lib/firestore'
import useAudioCleanup from '@/hooks/useAudioCleanup'

export default function Home() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  
  // Hook para limpiar audio
  useAudioCleanup()
  const [activeTab, setActiveTab] = useState('my-songs')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('added')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [songs, setSongs] = useState<Song[]>([])
  const [songsLoading, setSongsLoading] = useState(true)
  const [showAudioEditor, setShowAudioEditor] = useState(false)
  const [selectedSongForEditor, setSelectedSongForEditor] = useState<Song | null>(null)
  const [showProfessionalDAW, setShowProfessionalDAW] = useState(false)
  const [showProfessionalMixer, setShowProfessionalMixer] = useState(false)
  const [selectedSongForMixer, setSelectedSongForMixer] = useState<Song | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // Cargar canciones reales desde Firestore
  useEffect(() => {
    if (!user) {
      console.log('No user, skipping songs load')
      return
    }

    console.log('Loading songs for user:', user.uid)
    setSongsLoading(true)
    
    // Suscribirse a cambios en tiempo real
    const unsubscribe = subscribeToUserSongs(user.uid, (userSongs) => {
      console.log('Received songs in UI:', userSongs.length)
      setSongs(userSongs)
      setSongsLoading(false)
    })

    return () => {
      console.log('🧹 Unsubscribing from songs')
      unsubscribe()
    }
  }, [user])

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Error al cerrar sesión:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-teal-500 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-white font-bold text-2xl">J</span>
          </div>
          <p className="text-white text-lg">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const handleUploadComplete = (newSong: Song) => {
    // La lista se actualiza automáticamente por la suscripción a Firestore
    console.log('New song uploaded:', newSong)
  }

  const handleUploadClick = () => {
    setShowUploadModal(true)
  }

  const handleDeleteSong = async (songId: string, songTitle: string) => {
    if (!confirm(`¿Estás seguro de que quieres eliminar "${songTitle}"? Esta acción no se puede deshacer.`)) {
      return
    }

    try {
      console.log('Deleting song:', songId)
      await deleteSong(songId)
      console.log('Song deleted successfully')
      // La lista se actualizará automáticamente por la suscripción a Firestore
    } catch (error) {
      console.error('Error deleting song:', error)
      alert('Error al eliminar la canción. Por favor, inténtalo de nuevo.')
    }
  }

  const handleSongClick = (song: Song) => {
    console.log('Opening Professional DAW for song:', song.title)
    
    // Verificar si la canción tiene stems separados
    if (song.stems && Object.keys(song.stems).length > 0) {
      console.log('Song has stems, opening Professional DAW')
      setSelectedSongForEditor(song)
      setShowProfessionalDAW(true)
    } else {
      console.log('Song has no stems, showing message')
      alert('Esta canción no tiene pistas separadas. Necesitas procesarla primero con IA.')
    }
  }

  const openProfessionalMixer = (song: Song) => {
    console.log('Opening Professional Mixer for song:', song.title)
    
    // Verificar si la canción tiene stems separados
    if (song.stems && Object.keys(song.stems).length > 0) {
      console.log('Song has stems, opening Professional Mixer')
      setSelectedSongForMixer(song)
      setShowProfessionalMixer(true)
    } else {
      console.log('Song has no stems, showing message')
      alert('Esta canción no tiene pistas separadas. Necesitas procesarla primero con IA.')
    }
  }

  const handleAudioEditorClose = () => {
    console.log('Cerrando DAW - pausando todo el audio')
    
    // Usar la función global de limpieza si está disponible
    if ((window as any).stopAllAudio) {
      console.log('Usando función global de limpieza')
      ;(window as any).stopAllAudio()
    } else {
      console.log('Función global no disponible, usando método alternativo')
      
      // Método alternativo: pausar elementos de audio en el DOM
      const audioElements = document.querySelectorAll('audio')
      console.log(`Encontrados ${audioElements.length} elementos de audio en DOM`)
      
      audioElements.forEach((audio, index) => {
        console.log(`Pausando audio DOM ${index + 1}`)
        audio.pause()
        audio.currentTime = 0
        audio.src = ''
      })
    }
    
    setShowAudioEditor(false)
    setShowProfessionalDAW(false)
    setSelectedSongForEditor(null)
    
    console.log('DAW cerrado y audio detenido')
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      {/* Left Sidebar */}
      <div className="w-64 bg-gray-800 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">J</span>
            </div>
            <span className="text-xl font-bold text-white">Judith</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-4">
          <nav className="space-y-2">
            <div className="bg-gray-700 rounded-lg px-3 py-2">
              <span className="text-white font-medium">Track Separation</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-700 rounded-lg cursor-pointer">
              <span className="text-gray-300">AI Studio</span>
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">New</span>
            </div>
            <div className="px-3 py-2 hover:bg-gray-700 rounded-lg cursor-pointer">
              <span className="text-gray-300">Voice Studio</span>
            </div>
            <div className="px-3 py-2 hover:bg-gray-700 rounded-lg cursor-pointer">
              <span className="text-gray-300">Mastering</span>
            </div>
            <div className="px-3 py-2 hover:bg-gray-700 rounded-lg cursor-pointer">
              <span className="text-gray-300">Lyric Writer</span>
            </div>
            <div className="px-3 py-2 hover:bg-gray-700 rounded-lg cursor-pointer">
              <span className="text-gray-300">Plugins</span>
            </div>
          </nav>

          {/* Setlists Section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm font-medium">SETLISTS</span>
              <button className="text-teal-400 text-sm hover:text-teal-300">
                + New setlist
              </button>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-3 px-3 py-2 hover:bg-gray-700 rounded-lg cursor-pointer">
                <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">4</span>
                </div>
                <div>
                  <div className="text-white text-sm">Guitar Exercises</div>
                  <div className="text-gray-400 text-xs">Berklee Online</div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 px-3 py-2 hover:bg-gray-700 rounded-lg cursor-pointer">
                <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center">
                  <Music className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-white text-sm">Judith Collection</div>
                  <div className="text-gray-400 text-xs">Judith</div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">Track Separation</h1>
            <div className="flex items-center space-x-4">
              {/* Connection Status Icons */}
              <ConnectionStatus />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-gray-800 text-white pl-10 pr-4 py-2 rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none"
                />
              </div>
              <button 
                onClick={handleUploadClick}
                className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>New</span>
              </button>
              <button 
                onClick={() => setShowUploadModal(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
              >
                <Cloud className="w-4 h-4" />
                <span>Subir a la Nube</span>
              </button>
            <button
              onClick={() => router.push('/moises-features')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
            >
              <Zap className="w-4 h-4" />
              <span>Funcionalidades Moises</span>
            </button>
            
            {/* Botón de emergencia para detener todo el audio */}
            <button
              onClick={() => {
                if ((window as any).stopAllAudio) {
                  (window as any).stopAllAudio();
                }
                if ((window as any).stopAllSystemAudio) {
                  (window as any).stopAllSystemAudio();
                }
                alert('Todo el audio ha sido detenido (incluyendo del sistema)');
              }}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
            >
              <VolumeX className="w-4 h-4" />
              <span>Detener Todo el Audio</span>
            </button>
              
              {/* User Profile in Header */}
              <div className="flex items-center space-x-3 border-l border-gray-600 pl-4">
                <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="text-right">
                  <div className="text-white text-sm font-medium">
                    {user.displayName || user.email?.split('@')[0] || 'Usuario'}
                  </div>
                  <div className="text-gray-400 text-xs">Free</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center space-x-2 text-gray-400">
                <span className="text-sm">Added</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab('my-songs')}
              className={`pb-2 border-b-2 ${
                activeTab === 'my-songs' 
                  ? 'border-teal-500 text-white' 
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              My songs
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`pb-2 border-b-2 ${
                activeTab === 'shared' 
                  ? 'border-teal-500 text-white' 
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              Shared
            </button>
          </div>
          
          <div className="mt-2">
            <span className="text-gray-400 text-sm">{songs.length} songs</span>
          </div>
        </div>

        {/* Songs Table */}
        <div className="flex-1 p-6">
          {console.log('Songs count:', songs.length, 'Loading:', songsLoading)}
          {songsLoading ? (
            <div className="bg-gray-800 rounded-lg p-12 text-center">
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Music className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-white text-lg">Cargando canciones...</p>
            </div>
          ) : songs.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-12 text-center">
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Music className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">No songs yet</h3>
              <p className="text-gray-400 mb-6">Upload your first audio file to get started with track separation</p>
              <div className="space-y-3">
                <button 
                  onClick={handleUploadClick}
                  className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-3 rounded-lg flex items-center space-x-2 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Upload Audio</span>
                </button>
                
                <button 
                  onClick={() => {
                    // Crear canción de prueba
                    const testSong = {
                      id: 'test-' + Date.now(),
                      title: 'Canción de Prueba',
                      artist: 'Artista Test',
                      genre: 'Test',
                      bpm: 120,
                      key: 'C',
                      duration: '3:45',
                      thumbnail: '♪',
                      fileUrl: 'http://example.com/test.mp3',
                      uploadedAt: new Date().toISOString(),
                      userId: user?.uid || 'test',
                      fileSize: 1000000,
                      fileName: 'test.mp3',
                      status: 'completed' as const
                    };
                    setSongs([testSong]);
                    console.log('Canción de prueba agregada');
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center space-x-2 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar Canción de Prueba</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">Title</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">Artist</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">Genre</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">BPM</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">Key</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">Time Sig</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">Duration</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">Play</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {songs.map((song) => {
                    console.log('Rendering song:', song.title, 'ID:', song.id);
                    return (
                    <tr key={song.id} className="border-b border-gray-700 hover:bg-gray-700/50 cursor-pointer" onClick={() => handleSongClick(song)}>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-600 rounded flex items-center justify-center">
                            <span className="text-white text-sm">{song.thumbnail}</span>
                          </div>
                          <span className="text-white text-sm">{song.title}</span>
                          {song.stems && Object.keys(song.stems).length > 0 && (
                            <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">Separated</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-gray-300 text-sm">{song.artist}</td>
                      <td className="py-4 px-4 text-gray-300 text-sm">{song.genre || '-'}</td>
                      <td className="py-4 px-4 text-gray-300 text-sm">{song.bpm || '-'}</td>
                      <td className="py-4 px-4 text-gray-300 text-sm">{song.key || '-'}</td>
                      <td className="py-4 px-4 text-gray-300 text-sm">{song.timeSignature || '4/4'}</td>
                      <td className="py-4 px-4 text-gray-300 text-sm">{song.duration}</td>
                      <td className="py-4 px-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Implementar reproductor
                            console.log('Play song:', song.title);
                          }}
                          className="p-2 bg-teal-500 hover:bg-teal-600 text-white rounded-full"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          {song.stems && Object.keys(song.stems).length > 0 && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSongClick(song);
                                }}
                                className="p-2 bg-purple-500 hover:bg-purple-600 text-white rounded-full transition-colors duration-200 border-2 border-purple-400 hover:border-purple-300 shadow-lg hover:shadow-xl"
                                title="Abrir DAW"
                              >
                                <BarChart3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openProfessionalMixer(song);
                                }}
                                className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors duration-200 border-2 border-green-400 hover:border-green-300 shadow-lg hover:shadow-xl"
                                title="Mixer Profesional"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSong(song.id!, song.title);
                            }}
                            className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors duration-200 border-2 border-red-400 hover:border-red-300 shadow-lg hover:shadow-xl"
                            title="Eliminar canción"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-4 py-2">
        <div className="flex items-center space-x-2">
          <Volume2 className="w-4 h-4 text-gray-400" />
        </div>
        <div className="text-gray-400 text-sm">
          {new Date().toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <NewSongUpload
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={handleUploadComplete}
          onOpenMixer={(songId) => {
            setShowUploadModal(false);
            // Buscar la canción por ID en la lista de canciones
            const song = songs.find(s => s.id === songId);
            if (song) {
              setSelectedSongForEditor(song);
              setShowAudioEditor(true);
            }
          }}
        />
      )}

      {/* Professional DAW Modal */}
      {showProfessionalDAW && selectedSongForEditor && (
        <ProfessionalDAW
          isOpen={showProfessionalDAW}
          onClose={handleAudioEditorClose}
          songData={{
            id: selectedSongForEditor.id!,
            title: selectedSongForEditor.title,
            artist: selectedSongForEditor.artist,
            stems: Object.fromEntries(
              Object.entries(selectedSongForEditor.stems || {})
                .filter(([_, value]) => value !== undefined)
                .map(([key, value]) => [key, value as string])
            ),
            bpm: selectedSongForEditor.bpm || 120,
            key: selectedSongForEditor.key || 'C',
            timeSignature: selectedSongForEditor.timeSignature || '4/4',
            duration: selectedSongForEditor.duration || '0:00'
          }}
        />
      )}

      {/* Professional Mixer Modal */}
      {showProfessionalMixer && selectedSongForMixer && (
        <ProfessionalMixer
          stems={selectedSongForMixer.stems || { vocals: '', instrumental: '' }}
          songTitle={selectedSongForMixer.title}
          onClose={() => setShowProfessionalMixer(false)}
        />
      )}
    </div>
  )
}
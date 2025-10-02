# 🎵 Moises Clone - AI Audio Separation

A modern, elegant clone of Moises.ai built with cutting-edge technology for AI-powered audio separation.

## ✨ Features

- **🎤 Vocal Separation**: Extract vocals from any song
- **🥁 Multi-Stem Separation**: Separate drums, bass, guitar, piano, and more
- **🤖 AI-Powered**: Uses Spleeter and Demucs for high-quality separation
- **🎨 Modern UI**: Elegant dark theme with glassmorphism effects
- **⚡ Real-time Processing**: Background processing with status updates
- **📱 Responsive Design**: Works perfectly on all devices
- **🔊 Audio Preview**: Play stems directly in the browser
- **💾 Instant Download**: Download individual stems or all at once

## 🛠️ Technology Stack

### Backend
- **FastAPI** - High-performance Python web framework
- **Spleeter** - Deezer's AI audio separation library
- **Demucs** - Facebook's high-quality audio separation
- **Celery + Redis** - Background task processing
- **PostgreSQL** - Database
- **librosa** - Audio analysis and processing

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Smooth animations
- **React Dropzone** - File upload handling

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- FFmpeg
- Redis
- PostgreSQL

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd moises-clone
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Node.js dependencies**
   ```bash
   npm install
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Start the services**
   ```bash
   # Start backend
   cd backend
   uvicorn main:app --reload

   # Start frontend (in another terminal)
   npm run dev
   ```

### Using Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

## 📁 Project Structure

```
moises-clone/
├── backend/                 # FastAPI backend
│   ├── main.py             # Main API application
│   ├── audio_processor.py  # Audio processing logic
│   ├── models.py           # Pydantic models
│   └── database.py         # Database configuration
├── app/                    # Next.js app directory
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── components/             # React components
│   ├── AudioUploader.tsx   # File upload component
│   ├── ProcessingStatus.tsx # Processing status
│   └── StemsPlayer.tsx     # Audio player
├── hooks/                  # Custom React hooks
│   └── useAudioProcessor.ts # Audio processing hook
├── static/                 # Static files
├── uploads/                # Uploaded files
├── requirements.txt        # Python dependencies
├── package.json           # Node.js dependencies
└── docker-compose.yml     # Docker configuration
```

## 🎨 Design Features

- **Dark Theme**: Elegant dark color scheme
- **Glassmorphism**: Modern glass-like effects
- **Gradient Accents**: Beautiful color gradients
- **Smooth Animations**: Framer Motion animations
- **Responsive Layout**: Mobile-first design
- **Micro-interactions**: Delightful user interactions

## 🔧 API Endpoints

### Upload Audio
```http
POST /upload
Content-Type: multipart/form-data

file: audio file
separation_type: "2stems" | "4stems" | "5stems" | "demucs"
```

### Check Status
```http
GET /status/{task_id}
```

### Download Stem
```http
GET /download/{task_id}/{stem_name}
```

## 🎵 Supported Audio Formats

- MP3
- WAV
- FLAC
- M4A
- AAC
- OGG

## ⚡ Performance

- **File Size Limit**: 100MB
- **Processing Time**: 1-5 minutes depending on file size
- **Concurrent Users**: Supports multiple simultaneous uploads
- **Background Processing**: Non-blocking audio separation

## 🔒 Security

- File type validation
- Size limits
- CORS protection
- Input sanitization

## 🚀 Deployment

### Production Setup

1. **Configure environment variables**
2. **Set up PostgreSQL database**
3. **Configure Redis for task queue**
4. **Deploy with Docker or directly**

### Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/moises_clone
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **Deezer** for Spleeter
- **Facebook Research** for Demucs
- **Moises.ai** for inspiration
- **Open source community** for amazing libraries

---

**Built with ❤️ using modern web technologies**

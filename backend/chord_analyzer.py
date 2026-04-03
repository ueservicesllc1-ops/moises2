import librosa
import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import scipy.ndimage

@dataclass
class ChordResult:
    chord: str
    confidence: float
    start_time: float
    end_time: float
    root_note: str
    chord_type: str

@dataclass
class KeyResult:
    key: str
    mode: str
    confidence: float
    tonic: str

class ChordAnalyzer:
    def __init__(self):
        # Mapeo de notas para plantillas
        self.note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        
        # Generar plantillas de acordes básicos
        self.chord_templates = self._generate_templates()

    def _generate_templates(self) -> Dict[str, List[int]]:
        templates = {}
        for i, note in enumerate(self.note_names):
            # Mayor: 1, 5, 8 semitonos (0, 4, 7 en 0-index)
            major = [0] * 12
            major[i % 12] = 1
            major[(i + 4) % 12] = 1
            major[(i + 7) % 12] = 1
            templates[note] = major
            
            # Menor: 1, 4, 8 semitonos (0, 3, 7 en 0-index)
            minor = [0] * 12
            minor[i % 12] = 1
            minor[(i + 3) % 12] = 1
            minor[(i + 7) % 12] = 1
            templates[note + 'm'] = minor
            
        return templates

    def analyze_chords(self, file_path: str) -> List[ChordResult]:
        """Análisis profesional de acordes usando HPSS y CQT"""
        try:
            print(f"🎵 Iniciando análisis profesional en: {file_path}")
            y, sr = librosa.load(file_path, sr=22050)
            if len(y) == 0: return []
            
            # Separación Armónica para mejor detección
            y_harmonic, _ = librosa.effects.hpss(y)
            
            # Extracción de Chroma CQT
            chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=1024)
            
            # Suavizado para evitar brincos
            chroma = scipy.ndimage.median_filter(chroma, size=(1, 15))
            
            n_frames = chroma.shape[1]
            total_duration = len(y) / sr
            frame_time = total_duration / n_frames if n_frames > 0 else 0.05
            
            window_sec = 2.0
            num_windows = int(total_duration / window_sec)
            raw_chords = []
            
            for i in range(num_windows):
                start_t = i * window_sec
                s_frame = int(start_t / frame_time)
                e_frame = int((start_t + window_sec) / frame_time)
                if s_frame >= n_frames: break
                
                vec = np.mean(chroma[:, s_frame:max(s_frame+1, e_frame)], axis=1)
                vec_norm = vec / (np.linalg.norm(vec) + 1e-8)
                
                best_name = "C"
                best_score = -1.0
                for name, temp in self.chord_templates.items():
                    t_array = np.array(temp)
                    t_norm = t_array / (np.linalg.norm(t_array) + 1e-8)
                    score = np.dot(vec_norm, t_norm)
                    if score > best_score:
                        best_score = score
                        best_name = name
                
                raw_chords.append(ChordResult(
                    chord=best_name,
                    confidence=float(best_score),
                    start_time=float(start_t),
                    end_time=float(start_t + window_sec),
                    root_note=best_name.replace('m',''),
                    chord_type='minor' if 'm' in best_name else 'major'
                ))
            
            if not raw_chords: return []
            
            final_chords = []
            curr = raw_chords[0]
            for i in range(1, len(raw_chords)):
                if raw_chords[i].chord == curr.chord:
                    curr.end_time = raw_chords[i].end_time
                else:
                    final_chords.append(curr)
                    curr = raw_chords[i]
            final_chords.append(curr)
            
            return final_chords
        except Exception as e:
            print(f"❌ Error en analyze_chords: {e}")
            return []

    def analyze_key(self, file_path: str) -> Optional[KeyResult]:
        """Detecta la tonalidad principal (Pro-Engine)"""
        try:
            y, sr = librosa.load(file_path, sr=22050, duration=60) # Solo los primeros 60s
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            avg_chroma = np.mean(chroma, axis=1)
            avg_chroma = avg_chroma / (np.sum(avg_chroma) + 1e-8)
            
            # Perfiles mayor/menor
            major_p = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            minor_p = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
            
            best_k = "C"
            best_m = "major"
            best_s = -1.0
            
            for i in range(12):
                s_maj = np.correlate(avg_chroma, np.roll(major_p, i))[0]
                s_min = np.correlate(avg_chroma, np.roll(minor_p, i))[0]
                
                if s_maj > best_s:
                    best_s = s_maj
                    best_k = self.note_names[i]
                    best_m = "major"
                if s_min > best_s:
                    best_s = s_min
                    best_k = self.note_names[i]
                    best_m = "minor"
                    
            return KeyResult(key=best_k, mode=best_m, confidence=float(best_s), tonic=best_k)
        except:
            return None

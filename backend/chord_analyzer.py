"""
Chord Analyzer - Detección simplificada de acordes como Moises.ai
"""

import librosa
import numpy as np
from typing import List, Dict, Optional, NamedTuple, Tuple
from dataclasses import dataclass
import os

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
        # Plantillas de acordes básicos (12 semitonos)
        self.chord_templates = {
            # Acordes mayores
            'C': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],      # C-E-G
            'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],    # C#-F-G#
            'D': [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],     # D-F#-A
            'D#': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],    # D#-G-A#
            'E': [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],     # E-G#-B
            'F': [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],     # F-A-C
            'F#': [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],    # F#-A#-C#
            'G': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],     # G-B-D
            'G#': [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],    # G#-C-D#
            'A': [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],     # A-C#-E
            'A#': [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],    # A#-D-F
            'B': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],     # B-D#-F#
            
            # Acordes menores
            'Cm': [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],    # C-Eb-G
            'C#m': [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],   # C#-E-G#
            'Dm': [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],    # D-F-A
            'D#m': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],   # D#-F#-A#
            'Em': [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],    # E-G-B
            'Fm': [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],    # F-Ab-C
            'F#m': [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],   # F#-A-C#
            'Gm': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],    # G-Bb-D
            'G#m': [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],   # G#-B-D#
            'Am': [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],    # A-C-E
            'A#m': [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],   # A#-C#-F
            'Bm': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],    # B-D-F#
            
            # Acordes de séptima (simplificados)
            'C7': [1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0],    # C-E-G-Bb
            'Dm7': [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1],   # D-F-A-C
            'Em7': [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],   # E-G-B-D
            'F7': [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],    # F-A-C-Eb
            'G7': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],    # G-B-D-F
            'Am7': [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],   # A-C-E-G
            
            # Acordes suspendidos comunes
            'Csus4': [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], # C-F-G
            'Dsus4': [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], # D-G-A
            'Gsus4': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1], # G-C-D
            
            # Acordes con quintas aumentadas/disminuidas
            'Caug': [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],  # C-E-G#
            'Cdim': [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],  # C-Eb-Gb
        }
        
        # Nombres de notas
        self.note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        
        # Tonalidades comunes
        self.key_profiles = {
            'C': {'major': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], 'minor': [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]},
            'G': {'major': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], 'minor': [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]},
            'D': {'major': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], 'minor': [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]},
            'A': {'major': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], 'minor': [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]},
            'E': {'major': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], 'minor': [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]},
            'B': {'major': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], 'minor': [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]},
            'F': {'major': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], 'minor': [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]},
        }

    def analyze_chords(self, file_path: str, window_size: float = 1.0) -> List[ChordResult]:
        """Analiza los acordes de un archivo de audio con estructura musical"""
        try:
            print(f"Loading audio file: {file_path}")
            
            # Cargar audio
            y, sr = librosa.load(file_path, sr=22050)
            
            # Detectar tempo y beats
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=1024)
            beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=1024)
            
            print(f"Detected tempo: {float(tempo):.1f} BPM")
            print(f"Detected {len(beats)} beats")
            
            # Estimar compás (asumir 4/4 por defecto, pero podríamos detectar)
            time_signature = self._detect_time_signature(beat_times, tempo)
            beats_per_measure = time_signature[0]
            print(f"Estimated time signature: {time_signature[0]}/{time_signature[1]}")
            
            # Extraer características cromáticas con STFT (Máxima compatibilidad)
            print(f"Extracting features for: {file_path}")
            chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=1024)
            
            # Configurar dimensiones
            n_frames = chroma.shape[1]
            total_duration = len(y) / sr
            frame_time = total_duration / n_frames if n_frames > 0 else 0.05
            
            # Procesar con ventanas de 1.5 segundos
            chords = []
            window_duration = 1.5
            num_windows = int(total_duration / window_duration)
            
            print(f"Audio loaded: {y.shape}, Chroma: {chroma.shape}, Duration: {total_duration}s")
            
            for window_idx in range(num_windows):
                start_time = window_idx * window_duration
                end_time = (window_idx + 1) * window_duration
                
                # Convertir tiempo a frames
                start_frame = int(start_time / frame_time)
                end_frame = int(end_time / frame_time)
                
                if start_frame >= n_frames:
                    break
                
                # Promedio de la ventana
                window_data = chroma[:, start_frame:max(start_frame+1, end_frame)]
                window_chroma = np.mean(window_data, axis=1)
                
                # Normalizar
                c_sum = np.sum(window_chroma)
                if c_sum > 0:
                    window_chroma = window_chroma / c_sum
                
                # Detección simplificada
                best_chord_name = "C"
                best_score = -1.0
                
                for name, template in self.chord_templates.items():
                    # Score de coincidencia básica
                    score = np.dot(window_chroma, template)
                    if score > best_score:
                        best_score = score
                        best_chord_name = name
                
                chords.append(ChordResult(
                    chord=best_chord_name,
                    confidence=float(max(0.1, min(0.9, best_score))),
                    start_time=float(start_time),
                    end_time=float(end_time),
                    root_note=best_chord_name.replace('m', '').replace('7', ''),
                    chord_type=self._get_chord_type(best_chord_name)
                ))
            
            # Si algo falló y no hay acordes, forzar la tonalidad como acorde continuo
            if not chords:
                print("⚠️ No chords found in loop, applying key fallback")
                key_info = self.analyze_key(file_path)
                key_chord = "G" # Default ultra-safe
                if key_info:
                    key_chord = f"{key_info.key}{'m' if key_info.mode == 'minor' else ''}"
                
                chords.append(ChordResult(
                    chord=key_chord,
                    confidence=0.5,
                    start_time=0,
                    end_time=total_duration,
                    root_note=key_chord.replace('m', ''),
                    chord_type='minor' if 'm' in key_chord else 'major'
                ))

            # Unir acordes idénticos consecutivos para una lista limpia
            final_chords = []
            if chords:
                curr = chords[0]
                for i in range(1, len(chords)):
                    if chords[i].chord == curr.chord:
                        curr.end_time = chords[i].end_time
                    else:
                        final_chords.append(curr)
                        curr = chords[i]
                final_chords.append(curr)
            
            print(f"✅ Analysis finished: {len(final_chords)} chords found")
            return final_chords
            
        except Exception as e:
            print(f"❌ Critical error in analyze_chords: {e}")
            import traceback
            traceback.print_exc()
            return []

    def _get_chord_type(self, chord_name: str) -> str:
        """Determina el tipo de acorde"""
        if chord_name.endswith('m7'):
            return 'minor 7th'
        elif chord_name.endswith('7'):
            return 'dominant 7th'
        elif chord_name.endswith('m'):
            return 'minor'
        else:
            return 'major'

    def _filter_consecutive_chords(self, chords: List[ChordResult], min_duration: float = 0.5) -> List[ChordResult]:
        """Filtra acordes consecutivos idénticos - FILTRADO MUY SIMPLE"""
        if not chords:
            return chords
        
        # Solo eliminar duplicados exactos (mismo tiempo y acorde)
        unique_chords = []
        seen = set()
        
        for chord in chords:
            key = (chord.start_time, chord.chord)
            if key not in seen:
                seen.add(key)
                unique_chords.append(chord)
        
        return unique_chords

    def analyze_key(self, file_path: str) -> Optional[KeyResult]:
        """Analiza la tonalidad de la canción con algoritmo mejorado"""
        try:
            # Cargar audio
            y, sr = librosa.load(file_path, sr=22050)
            
            # Extraer características cromáticas con mejor resolución
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
            
            # Promediar características cromáticas
            avg_chroma = np.mean(chroma, axis=1)
            
            # Normalizar
            avg_chroma = avg_chroma / (np.sum(avg_chroma) + 1e-8)
            
            # Perfiles de Krumhansl-Schmuckler para tonalidades
            major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
            
            # Normalizar perfiles
            major_profile = major_profile / np.sum(major_profile)
            minor_profile = minor_profile / np.sum(minor_profile)
            
            # Probar cada tonalidad
            best_key = None
            best_score = -float('inf')
            
            for shift in range(12):
                # Rotar el perfil para cada tonalidad
                major_rotated = np.roll(major_profile, shift)
                minor_rotated = np.roll(minor_profile, shift)
                
                # Calcular correlación para mayor
                major_score = np.correlate(avg_chroma, major_rotated)[0]
                
                # Calcular correlación para menor
                minor_score = np.correlate(avg_chroma, minor_rotated)[0]
                
                # Verificar mayor
                if major_score > best_score:
                    best_score = major_score
                    best_key = KeyResult(
                        key=self.note_names[shift],
                        mode='major',
                        confidence=max(0, min(1, major_score)),
                        tonic=self.note_names[shift]
                    )
                
                # Verificar menor
                if minor_score > best_score:
                    best_score = minor_score
                    best_key = KeyResult(
                        key=self.note_names[shift],
                        mode='minor',
                        confidence=max(0, min(1, minor_score)),
                        tonic=self.note_names[shift]
                    )
            
            return best_key
            
        except Exception as e:
            print(f"Error analyzing key: {e}")
            return None

    def get_chord_diagram(self, chord_name: str) -> Dict:
        """Genera información del diagrama de guitarra para un acorde"""
        # Diagramas básicos de acordes de guitarra
        chord_diagrams = {
            'C': {
                'fingers': [{'string': 5, 'fret': 3}, {'string': 4, 'fret': 2}, {'string': 2, 'fret': 1}],
                'open_strings': [6, 3, 1],
                'muted_strings': []
            },
            'D': {
                'fingers': [{'string': 3, 'fret': 2}, {'string': 1, 'fret': 2}, {'string': 2, 'fret': 3}],
                'open_strings': [4],
                'muted_strings': [6, 5]
            },
            'Em': {
                'fingers': [{'string': 5, 'fret': 2}, {'string': 4, 'fret': 2}],
                'open_strings': [6, 3, 2, 1],
                'muted_strings': []
            },
            'F': {
                'fingers': [
                    {'string': 6, 'fret': 1}, {'string': 5, 'fret': 3}, 
                    {'string': 4, 'fret': 3}, {'string': 3, 'fret': 2}
                ],
                'open_strings': [],
                'muted_strings': []
            },
            'G': {
                'fingers': [{'string': 6, 'fret': 3}, {'string': 5, 'fret': 2}, {'string': 1, 'fret': 3}],
                'open_strings': [4, 3, 2],
                'muted_strings': []
            },
            'Am': {
                'fingers': [{'string': 4, 'fret': 2}, {'string': 3, 'fret': 2}, {'string': 2, 'fret': 1}],
                'open_strings': [5, 1],
                'muted_strings': [6]
            }
        }
        
        return chord_diagrams.get(chord_name, {
            'fingers': [],
            'open_strings': [],
            'muted_strings': []
        })

    def _detect_time_signature(self, beat_times: np.ndarray, tempo: float) -> Tuple[int, int]:
        """Detecta la signatura de tiempo basada en los beats detectados"""
        if len(beat_times) < 8:
            return (4, 4)  # Default a 4/4
        
        # Calcular intervalos entre beats
        beat_intervals = np.diff(beat_times)
        
        # Agrupar beats en compases (buscar patrones de 3 o 4 beats)
        # Para simplificar, asumir 4/4 por ahora
        return (4, 4)

    def _apply_harmonic_filtering(self, chords: List[ChordResult], tempo: float) -> List[ChordResult]:
        """Aplica filtrado armónico simplificado - SIN FILTRADO AGRESIVO"""
        if len(chords) < 2:
            return chords
        
        # Solo aplicar filtrado de estabilidad muy suave
        return self._filter_by_stability(chords)

    def _matches_progression(self, detected_chords: List[str], progression: List[str]) -> bool:
        """Verifica si una secuencia de acordes coincide con una progresión"""
        if len(detected_chords) != len(progression):
            return False
        
        matches = 0
        for i, (detected, expected) in enumerate(zip(detected_chords, progression)):
            if detected == expected or self._is_equivalent_chord(detected, expected):
                matches += 1
        
        return matches >= len(progression) * 0.75  # 75% de coincidencia

    def _is_equivalent_chord(self, chord1: str, chord2: str) -> bool:
        """Verifica si dos acordes son equivalentes (ej: Am = A minor)"""
        # Normalizar nombres de acordes
        c1 = chord1.replace('m', '').replace('7', '').replace('#', '').replace('b', '')
        c2 = chord2.replace('m', '').replace('7', '').replace('#', '').replace('b', '')
        return c1 == c2

    def _filter_by_stability(self, chords: List[ChordResult]) -> List[ChordResult]:
        """Filtra acordes manteniendo solo los más estables - FILTRADO MUY SIMPLE"""
        if len(chords) <= 1:
            return chords
        
        # Casi no filtrar nada para asegurar que el usuario vea la progresión
        filtered = [chord for chord in chords if chord.confidence > 0.05]
        
        if not filtered and chords:
            return chords[:1] # Al menos uno si existe
            
        return filtered

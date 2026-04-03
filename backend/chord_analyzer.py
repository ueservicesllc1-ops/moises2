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
            
            # Extraer características cromáticas con CQT (mejor resolución musical)
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
            
            # Configurar ventanas de tiempo
            hop_length = 512
            frame_time = hop_length / sr
            
            # Procesar con ventanas fijas de 1.5 segundos (más detalle)
            chords = []
            window_duration = 1.5
            
            # Dividir la canción en ventanas
            total_duration = len(y) / sr
            num_windows = int(total_duration / window_duration) + 1
            
            print(f"Processing {num_windows} windows of {window_duration}s each with CQT")
            
            for window_idx in range(num_windows):
                start_time = window_idx * window_duration
                end_time = min((window_idx + 1) * window_duration, total_duration)
                
                # Convertir tiempo a frames
                start_frame = int(start_time / frame_time)
                end_frame = int(end_time / frame_time)
                
                if start_frame >= chroma.shape[1]:
                    break
                
                # Promediar características cromáticas en la ventana
                window_chroma = np.mean(chroma[:, start_frame:end_frame], axis=1)
                
                # Normalizar
                window_chroma = window_chroma / (np.sum(window_chroma) + 1e-8)
                
                # Detectar acorde para esta ventana
                chord_result = self._detect_chord_in_frame(window_chroma)
                
                if chord_result:
                    chords.append(ChordResult(
                        chord=chord_result['chord'],
                        confidence=chord_result['confidence'],
                        start_time=start_time,
                        end_time=end_time,
                        root_note=chord_result['root_note'],
                        chord_type=chord_result['chord_type']
                    ))
                    print(f"Chord detected: {chord_result['chord']} at {start_time:.1f}s (conf: {chord_result['confidence']:.2f})")
            
            # Aplicar filtrado armónico inteligente
            chords = self._apply_harmonic_filtering(chords, tempo)
            
            print(f"Detected {len(chords)} chords:")
            for i, chord in enumerate(chords):
                print(f"  {i+1}. {chord.chord} at {float(chord.start_time):.1f}s (conf: {float(chord.confidence):.2f})")
            
            return chords
            
        except Exception as e:
            print(f"Error analyzing chords: {e}")
            return []

    def _detect_chord_in_frame(self, chroma_vector: np.ndarray) -> Optional[Dict]:
        """Detecta el acorde en un frame de características cromáticas - ALGORITMO SIMPLIFICADO"""
        
        # Normalizar el vector cromático
        chroma_normalized = chroma_vector / (np.sum(chroma_vector) + 1e-8)
        
        # Encontrar las 3 notas más fuertes
        top_indices = np.argsort(chroma_normalized)[-3:]
        top_values = chroma_normalized[top_indices]
        
        # Solo procesar si hay al menos una nota con energía significativa
        if np.max(chroma_normalized) < 0.1:
            return None
        
        best_chord = None
        best_score = 0
        
        # Probar solo acordes básicos (mayores y menores)
        basic_chords = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
                       'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm']
        
        for chord_name in basic_chords:
            if chord_name not in self.chord_templates:
                continue
                
            template = np.array(self.chord_templates[chord_name])
            
            # Método SIMPLE: producto punto normalizado
            score = np.dot(chroma_normalized, template)
            
            # Bonus si las notas principales del acorde están presentes
            chord_indices = np.where(template > 0)[0]
            if len(chord_indices) > 0:
                chord_strength = np.sum(chroma_normalized[chord_indices])
                score += chord_strength * 0.5
            
            if score > best_score:
                best_score = score
                best_chord = {
                    'chord': chord_name,
                    'confidence': min(1.0, score),
                    'root_note': chord_name.rstrip('m'),
                    'chord_type': self._get_chord_type(chord_name)
                }
        
        # Umbral más bajo para detectar más acordes
        if best_score > 0.2:
            return best_chord
        
        return None

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
        if len(chords) <= 5:
            return chords
        
        # Filtro de confianza generoso
        filtered = [chord for chord in chords if chord.confidence > 0.15]
        
        # Si filtramos demasiado, usar el umbral mínimo
        if len(filtered) < len(chords) * 0.2:
            filtered = [chord for chord in chords if chord.confidence > 0.1]
        
        return filtered

---
name: Sonic Neural
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c1c6d7'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8b90a0'
  outline-variant: '#414754'
  surface-tint: '#adc7ff'
  primary: '#adc7ff'
  on-primary: '#002e68'
  primary-container: '#4a8eff'
  on-primary-container: '#00285b'
  inverse-primary: '#005bc0'
  secondary: '#ebb2ff'
  on-secondary: '#520072'
  secondary-container: '#b600f8'
  on-secondary-container: '#fff6fc'
  tertiary: '#2ae500'
  on-tertiary: '#053900'
  tertiary-container: '#1da800'
  on-tertiary-container: '#043200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc7ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#f8d8ff'
  secondary-fixed-dim: '#ebb2ff'
  on-secondary-fixed: '#320047'
  on-secondary-fixed-variant: '#74009f'
  tertiary-fixed: '#79ff5b'
  tertiary-fixed-dim: '#2ae500'
  on-tertiary-fixed: '#022100'
  on-tertiary-fixed-variant: '#095300'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 20px
---

## Brand & Style

This design system is engineered for a high-performance AI audio separation service. The brand personality is **technical, precise, and futuristic**, aiming to evoke the feeling of a professional-grade studio tool powered by next-generation intelligence.

The visual style blends **Dark-themed Minimalism** with **Glassmorphism**. By using a deep, monochromatic base, we allow the neon accents to serve as functional indicators of sound data and AI processing. The UI should feel like a high-tech instrument—utilitarian yet visually captivating through the use of translucent layers and vibrant light-based accents.

**Target Audience:** Producers, DJs, and audiophiles who require precision and clarity in a mobile environment.

## Colors

The palette is rooted in a **Deep Charcoal/Black** foundation to maximize contrast and reduce eye strain in studio environments. 

- **Primary (Electric Blue):** Used for core interactions, active states, and primary AI processing indicators.
- **Secondary (Neon Purple):** Used for creative features, multi-track separation, and "Magic" AI functions.
- **Success/HiFi (Vibrant Green):** Reserved for high-fidelity confirmation, completed renders, and peak meter safety zones.
- **Surface Strategy:** Backgrounds are nearly black (#050505). Interactive cards use a semi-transparent glass effect to create a sense of depth and technical sophistication.

## Typography

The design system utilizes **Inter** for its neutral, highly legible characteristic which balances the vibrant UI accents. For technical readouts and mono-spaced requirements (like timestamps and bitrates), **Geist** is introduced to provide a developer-centric, precise aesthetic.

**Hierarchy Guidance:**
- Use **Display-lg** sparingly for hero numbers (e.g., BPM or track count).
- **Label-caps** should be used for all technical metadata and slider labels to maintain a "dashboard" feel.
- Line heights are kept tight to maximize information density, consistent with professional audio software.

## Layout & Spacing

This design system follows a **12-column fluid grid** for tablet and a **4-column fluid grid** for mobile. 

The rhythm is based on a **4px baseline grid**. 
- **Safe Areas:** Maintain a 20px side margin on mobile to ensure no content is lost to screen curves.
- **Mixer View:** In the audio mixer interface, use a "No Grid" contextual approach where vertical sliders are spaced evenly relative to the screen width, prioritizing thumb-reach over strict column alignment.
- **Density:** High density is encouraged for controls, but with 16px "breathing zones" between functional groups (e.g., separating the waveform view from the fader bank).

## Elevation & Depth

Depth is conveyed through **Backdrop Blurs** and **Tonal Layering** rather than traditional drop shadows.

1.  **Level 0 (Base):** #050505.
2.  **Level 1 (Cards):** Glassmorphism effect—`background: rgba(255, 255, 255, 0.03)` with a `backdrop-filter: blur(12px)`.
3.  **Level 2 (Modals/Overlays):** `background: rgba(255, 255, 255, 0.08)` with a 1px inner border of `rgba(255, 255, 255, 0.1)`.

**Glow Effects:** Active elements (like the "Split" button) should use a soft, colored outer glow (`box-shadow: 0 0 15px rgba(0, 123, 255, 0.4)`) to simulate light emitting from the screen.

## Shapes

The design system uses a **Rounded** shape language to soften the high-tech aesthetic and make it feel more approachable.

- **Standard Elements (Buttons, Inputs):** 8px (0.5rem) corner radius.
- **Container Cards:** 16px (1rem) corner radius for a distinct "panel" look.
- **Knobs/Dials:** Always 100% circular to mimic physical hardware.
- **Selection Indicators:** Use pill-shapes (32px+) for tags and active mode indicators.

## Components

**Buttons:** 
- **Primary:** Subtle linear gradient from Primary Blue to a slightly darker shade. 8px corner radius.
- **Ghost:** 1px border of `rgba(255, 255, 255, 0.2)` with no fill, becoming semi-transparent blue on tap.

**Custom Mixer Sliders:**
- **Track:** 4px thick, color #1A1A1A.
- **Progress:** Neon accent (Blue/Purple/Green).
- **Thumb:** Oversized (24px x 24px) with a glass effect and a glowing center dot.

**Waveform Display:**
- Use the Secondary (Purple) for the background waveform and Primary (Blue) for the "processed" foreground overlay.

**Chips:**
- Small, pill-shaped indicators for file formats (FLAC, MP3, WAV) using the `label-caps` typography and a low-opacity primary tint background.

**Cards:**
- All cards must implement the Glassmorphism blur. A 1px top-left highlight border should be used to simulate a light source from the top-left.
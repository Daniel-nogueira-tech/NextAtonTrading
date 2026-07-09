// Login.jsx
import React, { useState, useEffect, useRef } from 'react'
import './Login.css'
import { useContext } from 'react'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics'

const Login = () => {
    const { loginUser } = useContext(ContextGraphics);

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showLogin, setShowLogin] = useState(false)
    const [isAnimating, setIsAnimating] = useState(true)
    const canvasRef = useRef(null)

    // Efeito de onda de choque no canvas
    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')

        canvas.width = window.innerWidth
        canvas.height = window.innerHeight

        // Partículas para o efeito
        const particles = []
        const numParticles = 150
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2

        class Particle {
            constructor() {
                const angle = Math.random() * Math.PI * 2
                const radius = Math.random() * 300
                this.x = centerX + Math.cos(angle) * radius
                this.y = centerY + Math.sin(angle) * radius
                this.targetX = this.x
                this.targetY = this.y
                this.size = Math.random() * 3 + 1
                this.speed = 0.02 + Math.random() * 0.03
                this.angle = Math.atan2(this.y - centerY, this.x - centerX)
                this.distance = Math.sqrt((this.x - centerX) ** 2 + (this.y - centerY) ** 2)
                this.phase = Math.random() * Math.PI * 2
            }

            update(time) {
                // Movimento orbital com onda de choque
                const wave = Math.sin(time * 0.001 + this.phase) * 0.5 + 0.5
                const expansion = 1 + wave * 0.3

                this.distance = this.distance * (1 + Math.sin(time * 0.002 + this.phase) * 0.002)

                // Efeito de onda de choque
                const shockWave = Math.sin(this.distance * 0.02 - time * 0.005) * 0.5 + 0.5
                const shockRadius = 100 + Math.sin(time * 0.002) * 50

                if (Math.abs(this.distance - shockRadius) < 50) {
                    const pulse = 1 + Math.sin(this.distance * 0.1 - time * 0.01) * 0.1
                    this.size = (Math.random() * 3 + 1) * pulse
                }

                this.x = centerX + Math.cos(this.angle) * this.distance * expansion
                this.y = centerY + Math.sin(this.angle) * this.distance * expansion
            }

            draw(ctx, time) {
                const opacity = 0.3 + Math.sin(time * 0.001 + this.phase) * 0.2
                const gradient = ctx.createRadialGradient(
                    this.x, this.y, 0,
                    this.x, this.y, this.size
                )
                gradient.addColorStop(0, `rgba(124, 58, 237, ${opacity})`)
                gradient.addColorStop(1, `rgba(91, 33, 182, 0)`)

                ctx.beginPath()
                ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2)
                ctx.fillStyle = gradient
                ctx.fill()
            }
        }

        // Cria partículas
        for (let i = 0; i < numParticles; i++) {
            particles.push(new Particle())
        }

        let animationFrame
        let startTime = Date.now()

        const animate = () => {
            const time = Date.now() - startTime

            // Limpa canvas com transparência para efeito de rastro
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            // Desenha onda de choque
            const shockRadius = 150 + Math.sin(time * 0.002) * 80
            const shockGradient = ctx.createRadialGradient(
                centerX, centerY, 0,
                centerX, centerY, shockRadius
            )
            shockGradient.addColorStop(0, 'rgba(124, 58, 237, 0)')
            shockGradient.addColorStop(0.3, 'rgba(124, 58, 237, 0.05)')
            shockGradient.addColorStop(0.6, 'rgba(139, 92, 246, 0.1)')
            shockGradient.addColorStop(0.8, 'rgba(124, 58, 237, 0.05)')
            shockGradient.addColorStop(1, 'rgba(124, 58, 237, 0)')

            // Ondas de choque múltiplas
            for (let i = 0; i < 3; i++) {
                const offset = i * 200
                const waveRadius = (shockRadius + offset) % 600
                ctx.beginPath()
                ctx.arc(centerX, centerY, waveRadius, 0, Math.PI * 2)
                ctx.strokeStyle = `rgba(139, 92, 246, ${0.1 - i * 0.03})`
                ctx.lineWidth = 2 - i * 0.5
                ctx.stroke()
            }

            // Desenha partículas
            particles.forEach(particle => {
                particle.update(time)
                particle.draw(ctx, time)
            })

            // Desenha anéis orbitais
            for (let i = 1; i <= 3; i++) {
                const radius = 100 + i * 80 + Math.sin(time * 0.001 + i) * 20
                ctx.beginPath()
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
                ctx.strokeStyle = `rgba(124, 58, 237, ${0.05 - i * 0.01})`
                ctx.lineWidth = 1
                ctx.setLineDash([5, 10])
                ctx.stroke()
                ctx.setLineDash([])
            }

            // Átomo central com luz roxa pulsante
            const pulse = Math.sin(time * 0.003) * 0.3 + 0.7
            const glowSize = 80 + Math.sin(time * 0.002) * 20

            // Glow externo
            const outerGlow = ctx.createRadialGradient(
                centerX, centerY, 0,
                centerX, centerY, glowSize * 1.5
            )
            outerGlow.addColorStop(0, `rgba(139, 92, 246, ${0.3 * pulse})`)
            outerGlow.addColorStop(0.3, `rgba(124, 58, 237, ${0.2 * pulse})`)
            outerGlow.addColorStop(0.7, `rgba(91, 33, 182, ${0.1 * pulse})`)
            outerGlow.addColorStop(1, 'rgba(124, 58, 237, 0)')

            ctx.beginPath()
            ctx.arc(centerX, centerY, glowSize * 1.5, 0, Math.PI * 2)
            ctx.fillStyle = outerGlow
            ctx.fill()

            // Núcleo do átomo
            const coreGlow = ctx.createRadialGradient(
                centerX, centerY, 0,
                centerX, centerY, glowSize
            )
            coreGlow.addColorStop(0, `rgba(167, 139, 250, ${0.8 * pulse})`)
            coreGlow.addColorStop(0.2, `rgba(139, 92, 246, ${0.6 * pulse})`)
            coreGlow.addColorStop(0.5, `rgba(124, 58, 237, ${0.4 * pulse})`)
            coreGlow.addColorStop(0.8, `rgba(91, 33, 182, ${0.2 * pulse})`)
            coreGlow.addColorStop(1, 'rgba(124, 58, 237, 0)')

            ctx.beginPath()
            ctx.arc(centerX, centerY, glowSize, 0, Math.PI * 2)
            ctx.fillStyle = coreGlow
            ctx.fill()

            // Raio central brilhante
            const brightCore = ctx.createRadialGradient(
                centerX, centerY, 0,
                centerX, centerY, 30
            )
            brightCore.addColorStop(0, `rgba(255, 255, 255, ${0.8 * pulse})`)
            brightCore.addColorStop(0.3, `rgba(167, 139, 250, ${0.4 * pulse})`)
            brightCore.addColorStop(1, 'rgba(124, 58, 237, 0)')

            ctx.beginPath()
            ctx.arc(centerX, centerY, 30, 0, Math.PI * 2)
            ctx.fillStyle = brightCore
            ctx.fill()

            // Raios de luz
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2 + time * 0.001
                const length = 40 + Math.sin(time * 0.003 + i) * 20
                const startX = centerX + Math.cos(angle) * 20
                const startY = centerY + Math.sin(angle) * 20
                const endX = centerX + Math.cos(angle) * (20 + length)
                const endY = centerY + Math.sin(angle) * (20 + length)

                ctx.beginPath()
                ctx.moveTo(startX, startY)
                ctx.lineTo(endX, endY)
                ctx.strokeStyle = `rgba(167, 139, 250, ${0.2 * pulse})`
                ctx.lineWidth = 2
                ctx.stroke()
            }

            // Efeito de explosão (ocorre periodicamente)
            const explosionPhase = Math.sin(time * 0.001)
            if (explosionPhase > 0.9 && explosionPhase < 0.95) {
                // Mini explosão de partículas
                for (let i = 0; i < 20; i++) {
                    const angle = Math.random() * Math.PI * 2
                    const distance = 50 + Math.random() * 200
                    const x = centerX + Math.cos(angle) * distance
                    const y = centerY + Math.sin(angle) * distance

                    const particleGlow = ctx.createRadialGradient(
                        x, y, 0,
                        x, y, 10
                    )
                    particleGlow.addColorStop(0, `rgba(167, 139, 250, 0.3)`)
                    particleGlow.addColorStop(1, 'rgba(124, 58, 237, 0)')

                    ctx.beginPath()
                    ctx.arc(x, y, 10, 0, Math.PI * 2)
                    ctx.fillStyle = particleGlow
                    ctx.fill()
                }
            }

            animationFrame = requestAnimationFrame(animate)
        }

        animate()

        // Timer para mostrar o login após a animação inicial
        setTimeout(() => {
            setIsAnimating(false)
            setShowLogin(true)
        }, 2000)

        // Cleanup
        return () => {
            cancelAnimationFrame(animationFrame)
        }
    }, [])

    const handleSubmit = (e) => {
        e.preventDefault()
        console.log('Login attempt:', { email, password })
        // Aqui você adiciona a lógica de autenticação
        loginUser(email, password)
    }

    return (
        <div className="login-page">
            {/* Canvas para animações */}
            <canvas ref={canvasRef} className="login-canvas" />

            {/* Overlay gradiente */}
            <div className="login-overlay" />

            {/* Conteúdo do Login */}
            <div className={`login-container ${showLogin ? 'login-container--visible' : ''}`}>
                <div className="login-card">
                    <div className="login-card__header">
                        <div className="login-card__logo">
                            <img
                                src="/aton.ico"
                                alt="Atom"
                                className="login-card__logo-img"
                            />
                            <h1 className="login-card__title">NextAton<span>Trading</span></h1>
                        </div>
                        <p className="login-card__subtitle">
                            Enter the smart trading platform.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-card__form">
                        <div className="login-card__field">
                            <label className="login-card__label">
                                <span className="login-card__label-icon">📩</span>
                                Email
                            </label>
                            <input
                                type="email"
                                name="email"
                                autoComplete="username"
                                className="login-card__input"
                                placeholder="your@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="login-card__field">
                            <label className="login-card__label">
                                <span className="login-card__label-icon">🔒</span>
                                Senha
                            </label>
                            <input
                                type="password"
                                name="password"
                                autoComplete="current-password"
                                className="login-card__input"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <button type="submit" className="login-card__button">
                            <span>To enter</span>
                            <span className="login-card__button-icon">→</span>
                        </button>
                    </form>

                    <div className="login-card__footer">
                        <a href="#" className="login-card__link">Forgot your password?</a>
                        <span className="login-card__divider">|</span>
                        <a href="#" className="login-card__link login-card__link--primary">
                            Create account
                        </a>
                    </div>

                    <div className="login-card__terms">
                        <span>🔒</span>
                        <p className="login-card__terms-text">
                            By continuing, you agree to the <a href="#">Terms of Use</a> and the <a href="#">Privacy Policy</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Login
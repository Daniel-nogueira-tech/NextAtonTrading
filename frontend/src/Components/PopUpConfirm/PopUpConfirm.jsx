// PopUpConfirm.jsx
import React, { useEffect, useRef, useState } from 'react'
import './PopUpConfirm.css'

const PopUpConfirm = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirmar Ação',
  message = 'Tem certeza que deseja realizar esta ação?',
  confirmText = 'Continuar',
  cancelText = 'Cancelar',
  confirmColor = 'primary', // 'primary', 'danger', 'warning'
  icon = '⚠️',
  isDestructive = false
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const popupRef = useRef(null)
  const confirmButtonRef = useRef(null)

  // Controle de animações
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      setIsClosing(false)
      // Foco no botão de confirmação após animação
      setTimeout(() => {
        confirmButtonRef.current?.focus()
      }, 400)
    } else {
      setIsClosing(true)
      setTimeout(() => {
        setIsVisible(false)
        setIsClosing(false)
      }, 300)
    }
  }, [isOpen])

  // Fechar com ESC
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen])

  // Evitar scroll do body quando popup está aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleClose = () => {
    if (!isClosing) {
      setIsClosing(true)
      setTimeout(() => {
        onClose()
      }, 300)
    }
  }

  const handleConfirm = () => {
    if (!isClosing) {
      setIsClosing(true)
      setTimeout(() => {
        onConfirm()
        onClose()
      }, 300)
    }
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  if (!isVisible) return null

  // Cores baseadas no tipo
  const getButtonColors = () => {
    if (isDestructive) {
      return {
        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
        hover: '0 10px 30px rgba(239, 68, 68, 0.3)',
        boxShadow: '0 0 30px rgba(239, 68, 68, 0.1)'
      }
    }
    switch (confirmColor) {
      case 'danger':
        return {
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          hover: '0 10px 30px rgba(239, 68, 68, 0.3)',
          boxShadow: '0 0 30px rgba(239, 68, 68, 0.1)'
        }
      case 'warning':
        return {
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          hover: '0 10px 30px rgba(245, 158, 11, 0.3)',
          boxShadow: '0 0 30px rgba(245, 158, 11, 0.1)'
        }
      default:
        return {
          background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
          hover: '0 10px 30px rgba(124, 58, 237, 0.3)',
          boxShadow: '0 0 30px rgba(124, 58, 237, 0.1)'
        }
    }
  }

  const buttonColors = getButtonColors()

  return (
    <div 
      className={`popup-overlay ${isClosing ? 'popup-overlay--closing' : ''}`}
      onClick={handleOverlayClick}
    >
      <div 
        ref={popupRef}
        className={`popup ${isClosing ? 'popup--closing' : ''}`}
      >
        {/* Cabeçalho */}
        <div className="popup__header">
          <div className="popup__icon-wrapper">
            <span className="popup__icon">{icon}</span>
          </div>
          <button 
            className="popup__close"
            onClick={handleClose}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div className="popup__body">
          <h2 className="popup__title">{title}</h2>
          <p className="popup__message">{message}</p>
        </div>

        {/* Rodapé com botões */}
        <div className="popup__footer">
          <button
            className="popup__button popup__button--cancel"
            onClick={handleClose}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            className="popup__button popup__button--confirm"
            onClick={handleConfirm}
            style={{
              background: buttonColors.background,
              boxShadow: buttonColors.boxShadow
            }}
          >
            <span className="popup__button-text">{confirmText}</span>
            <span className="popup__button-icon">→</span>
          </button>
        </div>

        {/* Anel de luz decorativo */}
        <div className="popup__glow-ring" />
        <div className="popup__glow-ring popup__glow-ring--secondary" />
      </div>
    </div>
  )
}

export default PopUpConfirm
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado en la aplicación.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Dracula Chess ErrorBoundary caught:', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#090608] text-[#f5ece8] p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#110a0d] border-2 border-[#750a18] p-6 text-center space-y-4 shadow-2xl">
            <h1 className="font-gothic text-2xl font-black text-[#f8ecea]">
              DRÁCULA <span className="text-[#e61229]">AJEDREZ 3D</span>
            </h1>
            <p className="text-sm text-[#d4c2c5]">
              Ha ocurrido un problema al inicializar la vista gráfica del juego.
            </p>
            <p className="text-xs font-mono text-[#ff8a98] bg-[#1e0d12] border border-[#591722] rounded-lg px-3 py-2 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 rounded-xl bg-[#d61126] hover:bg-[#ef1830] text-white font-bold text-sm border border-[#ff6b7d]/50 cursor-pointer"
            >
              Recargar partida
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

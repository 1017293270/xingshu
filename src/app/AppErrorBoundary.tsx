import { Component, type ReactNode } from "react";
import "./app-error-boundary.css";

type AppErrorBoundaryProps = {
  children: ReactNode;
  onReload?: () => void;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  private handleReload = () => {
    if (this.props.onReload) {
      this.props.onReload();
      return;
    }

    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="app-error-boundary" role="alert">
        <section className="app-error-boundary__panel">
          <span className="app-error-boundary__mark" aria-hidden="true">!</span>
          <p className="app-error-boundary__eyebrow">PAGE RECOVERY</p>
          <h1>页面加载失败</h1>
          <p>页面资源可能已更新，刷新后即可继续使用。</p>
          <div className="app-error-boundary__actions">
            <button type="button" onClick={this.handleReload}>刷新页面</button>
            <a href="/">返回首页</a>
          </div>
        </section>
      </main>
    );
  }
}

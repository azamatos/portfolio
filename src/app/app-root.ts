import { LitElement, html, css } from "lit";
import "@/components/header";
import "@/components/hero";

export class AppRoot extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    main {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
  `;

  render() {
    return html`
      <main>
        <site-header></site-header>
        <hero-section></hero-section>
      </main>
    `;
  }
}

customElements.define("app-root", AppRoot);
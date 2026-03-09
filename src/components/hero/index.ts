import { LitElement, html, css } from "lit";
import "@/components/hero/hero-title";
import "@/components/hero/hero-image";

export class HeroSection extends LitElement {

  static styles = css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    section {
      display: flex;
      align-items: flex-start;
      width: 100%;
      height: 100%;
      padding: 160px 0 0 120px;
      position: relative;
      overflow: hidden;
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: 20px;
      z-index: 1;
      flex-shrink: 0;
    }

    h1 {
      font-size: 120px;
      margin: 0;
      font-weight: 500;
      letter-spacing: -0.06em;
      line-height: 1em;
      color: var(--color-text-secondary);
    }

    .name {
      color: var(--color-text-primary);
    }

    .subtitle-container {
      max-width: 500px;
    }

    .description {
      font-size: 20px;
      line-height: 1.4em;
      letter-spacing: -0.03em;
      color: var(--color-text-secondary);
      margin: 0;
    }

    @media (max-width: 1920px) {
      h1 {
        font-size: 72px;
      }

      .description {
        font-size: 18px;
      }
    }

    @media (max-width: 1200px) {
      section {
        padding: 160px 80px 120px;
      }

      h1 {
        font-size: 56px;
      }
    }

    @media (max-width: 800px) {
      section {
        padding-left: 24px;
        padding-right: 24px;
        padding-top: 100px;
      }

      .content {
        max-width: 100%;
      }

      h1 {
        font-size: 40px;
      }
    }
  `;

  render() {
    return html`
      <section>
        <div class="content">
          <h1>
            Hi, I'm <span class="name">Azamat Jorayev.</span>
          </h1>
          <hero-title></hero-title>
          <div class="subtitle-container">
            <p class="description">
              Passionate about building reliable systems,
              clean architecture, and great developer experiences.
            </p>
          </div>
        </div>
        <hero-image></hero-image>
      </section>
    `;
  }
}

customElements.define("hero-section", HeroSection);
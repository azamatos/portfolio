import { LitElement, html, css } from "lit";
import { DELETE_SPEED, PAUSE_TIME, TITLES, TYPE_SPEED } from "./constants";

export class HeroTitle extends LitElement {

  static styles = css`
    p {
      font-size: 120px;
      font-weight: 500;
      letter-spacing: -0.06em;
      line-height: 1em;
      color: #a6a6a6;
      font-family: inherit;

      display: inline-flex;
      align-items: flex-end;
      gap: 4px;

      margin: 0;
    }

    .word {
      margin-left: 20px;
      display: inline-block;
      color: var(--color-text-primary);
    }

    .cursor {
      width: 2px;
      height: 0.9em;
      background: var(--color-text-primary);

      animation: blink 1s steps(1) infinite;
    }

    .typing {
      animation: none;
    }

    @keyframes blink {
      50% {
        opacity: 0;
      }
    }

    @media (max-width: 1920px) {
      p { font-size: 72px; }
      .word { margin-left: 12px; }
    }

    @media (max-width: 1200px) {
      p { font-size: 56px; }
      .word { margin-left: 8px; }
    }

    @media (max-width: 800px) {
      p { font-size: 32px; }
      .word { margin-left: 4px; }
    }
  `;

  render() {
    return html`
      <p>
        I'm a<span class="word"></span>
        <span class="cursor"></span>
      </p>
    `;
  }

  firstUpdated() {
    const wordEl = this.renderRoot.querySelector(".word")!;
    const cursor = this.renderRoot.querySelector(".cursor")!;

    let wordIndex = 0;
    let charIndex = 0;
    let deleting = false;

    const loop = () => {
      const word = TITLES[wordIndex];

      cursor.classList.add("typing");

      if (!deleting) {
        charIndex++;
      } else {
        charIndex--;
      }

      wordEl.textContent = word.slice(0, charIndex);

      if (!deleting && charIndex === word.length) {
        deleting = true;
        cursor.classList.remove("typing");

        setTimeout(loop, PAUSE_TIME);
        return;
      }

      if (deleting && charIndex === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % TITLES.length;
      }

      setTimeout(loop, deleting ? DELETE_SPEED : TYPE_SPEED);
    };

    loop();
  }
}

customElements.define("hero-title", HeroTitle);
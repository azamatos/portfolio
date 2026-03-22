import { LitElement, html, css } from "lit";
import { classMap } from "lit/directives/class-map.js";

export class SiteHeader extends LitElement {
  static properties = {
    open: { type: Boolean },
  };

  open = false;

  private _onOutsideClick = (e: MouseEvent) => {
    if (!e.composedPath().includes(this)) {
      this.open = false;
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("mousedown", this._onOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("mousedown", this._onOutsideClick);
  }

  private toggleMenu() {
    this.open = !this.open;
  }

  static styles = css`
    :host {
      display: block;
    }

    header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 24px 40px;
      position: relative;
      z-index: 10;
    }

    .resume {
      position: relative;
    }

    .text {
      font-size: 20px;
      letter-spacing: -0.02em;
      font-family: inherit;
    }

    button {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.02);
      color: var(--color-text-primary);
      padding: 10px 18px;
      cursor: pointer;
      font-size: 14px;
      letter-spacing: -0.02em;
      font-family: inherit;
      border-radius: 8px;
      backdrop-filter: blur(10px);
      transition: all .18s ease;
    }

    button:hover {
      background: rgba(255,255,255,0.06);
      border-color: rgba(255,255,255,0.35);
    }

    .chevron {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform .2s ease;

      svg {
        width: 14px;
        height: 14px;
      }
    }

    button.open .chevron {
      transform: rotate(180deg);
    }


    .popover {
      position: absolute;
      right: 0;
      top: calc(100% + 10px);

      background: rgba(15,15,15,0.92);
      backdrop-filter: blur(20px) saturate(140%);

      border: 1px solid rgba(255,255,255,0.08);

      border-radius: 14px;

      padding: 6px;

      min-width: 210px;

      box-shadow:
        0 40px 100px rgba(0,0,0,.55),
        0 8px 20px rgba(0,0,0,.4);

      opacity: 0;
      pointer-events: none;

      transform: translateY(-6px) scale(.96);

      transition:
      opacity .18s ease,
      transform .18s ease;
    }

    .popover.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }

    .popover a {
      display: flex;
      align-items: center;
      justify-content: space-between;

      padding: 11px 14px;

      border-radius: 8px;
      text-decoration: none;

      color: var(--color-text-primary);

      font-size: 14px;
      letter-spacing: -0.02em;

      transition:
        background .12s ease,
        transform .12s ease,
        opacity .14s ease;

      opacity: 0;
      transform: translateY(-4px);
    }

    .popover.open a:nth-child(1) {
      opacity: 1;
      transform: translateY(0);
      transition-delay: .04s;
    }

    .popover.open a:nth-child(2) {
      opacity: 1;
      transform: translateY(0);
      transition-delay: .07s;
    }

    .popover.open a:nth-child(3) {
      opacity: 1;
      transform: translateY(0);
      transition-delay: .1s;
    }

    .popover.open a:nth-child(4) {
      opacity: 1;
      transform: translateY(0);
      transition-delay: .13s;
    }

    .popover a:hover {
      background: rgba(255,255,255,0.08);
      transform: translateX(3px);
    }

    .label {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .title {
      font-size: 18px;
      color: var(--color-text-primary);
    }

    .hint {
      font-size: 13px;
      color: var(--color-text-secondary);
    }

    .badge {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;

      color: #999;

      background: rgba(255,255,255,.08);

      border-radius: 5px;

      padding: 3px 6px;
    }

    @media (max-width: 1920px) {
      .text {
        font-size: 18px;
      }

      .chevron {
        width: 20px;
        height: 20px;
      }

      .chevron svg {
        width: 12px;
        height: 12px;
      }

      .title {
        font-size: 14px;
      }

      .hint {
        font-size: 11px;
      }

      .badge {
        font-size: 10px;
      }

      .popover {
        min-width: 200px;
      }
    }


    @media (max-width: 1200px) {
      .text {
        font-size: 16px;
      }

      .popover {
        min-width: 190px;
      }
    }

    @media (max-width: 800px) {
      .text {
        font-size: 16px;
      }

      .chevron {
        width: 12px;
        height: 12px;
      }

      .chevron svg {
        width: 10px;
        height: 10px;
      }

      .title {
        font-size: 12px;
      }

      .hint {
        font-size: 10px;
      }

      .badge {
        font-size: 8px;
      }

      .popover {
        min-width: 160px;
      }
    }
  `;

  render() {
    const btnClass = classMap({ open: this.open });
    const popoverClass = classMap({ popover: true, open: this.open });

    return html`
      <header>
        <div class="resume">

          <button class=${btnClass} @click=${this.toggleMenu}>
            <span class="text">Resume</span>
            <span class="chevron">
              <svg viewBox="0 0 10 6">
                <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </button>

          <div class=${popoverClass}>
            ${this.link("Fullstack", "/fullstack.pdf")}
            ${this.link("Mobile", "/mobile.pdf")}
            ${this.link("Frontend", "/frontend.pdf")}
            ${this.link("Backend", "/backend.pdf")}
          </div>

        </div>
      </header>
    `;
  }

  private link(name: string, url: string) {
    return html`
      <a href=${url} download="Azamat Jorayev - ${name}.pdf">
        <span class="label">
          <span class="title">${name}</span>
          <span class="hint">PDF document</span>
        </span>

        <span class="badge">pdf</span>
      </a>
    `;
  }
}

customElements.define("site-header", SiteHeader);
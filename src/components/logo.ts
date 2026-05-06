import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('site-logo')
export class SiteLogo extends LitElement {
    static styles = css`
        :host {
            display: block;
        }

        .logo {
            font-family: 'Space Mono', monospace;
            font-size: 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.25em;
        }
        
        .logo .arrow {
            color: #68edc0;
        }
        
        .logo .tilde {
            color: #5bc8c0;
        }
        
        .logo .name {
            color: #f0f4f3;
        }
        
        .logo .cursor {
            color: #f0f4f3;
            animation: blink 1.1s step-end infinite;
        }
        
        @keyframes blink {
        
            0%,
            100% {
                opacity: 1;
            }
        
            50% {
                opacity: 0;
            }
        }`;

    override render() {
        return html`
            <div class="logo">
                <span class="arrow">➜</span>
                <span class="tilde">~</span>
                <span class="name">azamatos</span>
                <span class="cursor">▊</span>
            </div>
            `;
    }
}

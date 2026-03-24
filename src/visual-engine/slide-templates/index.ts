import type { Slide } from '../../types';
import { renderIntroSlide } from './intro.template';
import { renderContentSlide } from './content.template';
import { renderEngagementSlide } from './engagement.template';
import { renderOutroSlide } from './outro.template';

export type SlideRenderResult = { html: string; templateClass: string };

/**
 * Dispatcher: stuurt elk slide-type naar de juiste template-renderer.
 * slideIndex wordt gebruikt voor blok-variatie (0-based).
 */
export function renderSlide(slide: Slide, slideIndex: number): SlideRenderResult {
    switch (slide.type) {
        case 'intro':
            return renderIntroSlide(slide, slideIndex);
        case 'outro':
            return renderOutroSlide(slide, slideIndex);
        case 'engagement':
            return renderEngagementSlide(slide, slideIndex);
        case 'content':
        default:
            return renderContentSlide(slide, slideIndex);
    }
}

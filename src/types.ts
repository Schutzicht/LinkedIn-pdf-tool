// Type definitions

export type SlideType = 'intro' | 'content' | 'engagement' | 'outro';

export interface Slide {
    type: SlideType;
    id: string;
    content: {
        title?: string;
        body?: string;
        subtitle?: string;
        footer?: string; // e.g. "Bron: ..."
        cta?: string; // "Klik hier" or "Like & comment"
        imageKeyword?: string;
        blokken?: string[]; // e.g. ["Sterktes", "Zwaktes", "Kansen", "Bedreigingen"]
    };
    visuals?: {
        icon?: string; // Icon name e.g. "growth-ban"
        backgroundImage?: string;
        style?: string;
        layout?: string; // Intro layout: grid, hero, sidebar, diagonal, bottom-row, pyramid, scattered, stack
    };
    decorations?: Array<{
        type: string;
        [key: string]: any;
    }>;
}

export interface CarouselData {
    title: string;
    topic: string; // Added to track what triggered it
    postBody: string; // The LinkedIn text content
    slides: Slide[];
    metadata: {
        author: string;
        date: string;
    };
}

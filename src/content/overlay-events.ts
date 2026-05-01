interface OverlayEventHandlers {
    handleMouseMove: (event: MouseEvent) => void;
    handleClick: (event: MouseEvent) => void;
    handleKeyDown: (event: KeyboardEvent) => void;
    handleKeyUp: (event: KeyboardEvent) => void;
    handleScroll: () => void;
}

export function bindOverlayEvents(handlers: OverlayEventHandlers): () => void {
    document.addEventListener('mousemove', handlers.handleMouseMove, true);
    document.addEventListener('click', handlers.handleClick, true);
    document.addEventListener('keydown', handlers.handleKeyDown, true);
    document.addEventListener('keyup', handlers.handleKeyUp, true);
    window.addEventListener('scroll', handlers.handleScroll, true);

    return () => {
        document.removeEventListener('mousemove', handlers.handleMouseMove, true);
        document.removeEventListener('click', handlers.handleClick, true);
        document.removeEventListener('keydown', handlers.handleKeyDown, true);
        document.removeEventListener('keyup', handlers.handleKeyUp, true);
        window.removeEventListener('scroll', handlers.handleScroll, true);
    };
}

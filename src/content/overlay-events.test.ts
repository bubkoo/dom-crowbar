import { describe, expect, it, vi } from 'vitest';
import { bindOverlayEvents } from './overlay-events';

describe('bindOverlayEvents', () => {
    it('registers and unregisters all overlay listeners', () => {
        const addDocSpy = vi.spyOn(document, 'addEventListener');
        const removeDocSpy = vi.spyOn(document, 'removeEventListener');
        const addWinSpy = vi.spyOn(window, 'addEventListener');
        const removeWinSpy = vi.spyOn(window, 'removeEventListener');

        const handlers = {
            handleMouseMove: vi.fn<(event: MouseEvent) => void>(),
            handleClick: vi.fn<(event: MouseEvent) => void>(),
            handleKeyDown: vi.fn<(event: KeyboardEvent) => void>(),
            handleKeyUp: vi.fn<(event: KeyboardEvent) => void>(),
            handleScroll: vi.fn<() => void>(),
        };

        const unbind = bindOverlayEvents(handlers);

        expect(addDocSpy).toHaveBeenCalledWith('mousemove', handlers.handleMouseMove, true);
        expect(addDocSpy).toHaveBeenCalledWith('click', handlers.handleClick, true);
        expect(addDocSpy).toHaveBeenCalledWith('keydown', handlers.handleKeyDown, true);
        expect(addDocSpy).toHaveBeenCalledWith('keyup', handlers.handleKeyUp, true);
        expect(addWinSpy).toHaveBeenCalledWith('scroll', handlers.handleScroll, true);

        unbind();

        expect(removeDocSpy).toHaveBeenCalledWith('mousemove', handlers.handleMouseMove, true);
        expect(removeDocSpy).toHaveBeenCalledWith('click', handlers.handleClick, true);
        expect(removeDocSpy).toHaveBeenCalledWith('keydown', handlers.handleKeyDown, true);
        expect(removeDocSpy).toHaveBeenCalledWith('keyup', handlers.handleKeyUp, true);
        expect(removeWinSpy).toHaveBeenCalledWith('scroll', handlers.handleScroll, true);

        addDocSpy.mockRestore();
        removeDocSpy.mockRestore();
        addWinSpy.mockRestore();
        removeWinSpy.mockRestore();
    });
});

import type { SVGProps } from "react";

/*
 * The app's icons: simple 24-unit stroke drawings, inline so they take the text colour and need no
 * icon font or sprite. Decorative by default — the button or label around an icon names it.
 */

const PATHS = {
    text: "M5 6V5h14v1M12 5v14M9 19h6",
    address: "M4 6h10M4 10h16M4 14h12M4 18h8",
    image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01",
    qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2",
    barcode: "M4 5v14M7 5v14M9.5 5v14M13 5v14M15 5v14M18 5v14M20 5v14",
    rectangle: "M4 6h16v12H4z",
    ellipse: "M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z",
    line: "M4 18L20 6",
    undo: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
    redo: "M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3",
    plus: "M12 5v14M5 12h14",
    trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
    copy: "M9 9h10v10H9zM5 15V5h10",
    lock: "M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z",
    unlock: "M7 11V8a5 5 0 019.6-2M6 11h12v9H6z",
    eye: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z",
    eyeOff: "M3 3l18 18M10.6 6.1A10.7 10.7 0 0112 6c6.4 0 10 6 10 6a17 17 0 01-3 3.6M6.6 6.6C3.8 8.3 2 12 2 12s3.6 6 10 6c1.6 0 3-.4 4.3-1",
    upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
    download: "M12 4v12M7 11l5 5 5-5M4 16v4h16v-4",
    printer: "M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2M7 14h10v6H7z",
    file: "M6 3h8l4 4v14H6zM14 3v4h4",
    table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
    sheet: "M6 3h12v18H6zM8.5 6h3v2h-3zM12.5 6h3v2h-3zM8.5 10h3v2h-3zM12.5 10h3v2h-3zM8.5 14h3v2h-3zM12.5 14h3v2h-3z",
    chevronLeft: "M15 6l-6 6 6 6",
    chevronRight: "M9 6l6 6-6 6",
    chevronDown: "M6 9l6 6 6-6",
    settings: "M12 9a3 3 0 110 6 3 3 0 010-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
    alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
    check: "M5 12l5 5 9-10",
    close: "M6 6l12 12M18 6L6 18",
    fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    zoomIn: "M11 4a7 7 0 110 14 7 7 0 010-14zM20 20l-4-4M11 8v6M8 11h6",
    zoomOut: "M11 4a7 7 0 110 14 7 7 0 010-14zM20 20l-4-4M8 11h6",
    grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
    alignLeft: "M4 4v16M8 8h10M8 16h6",
    alignCenterH: "M12 4v16M6 8h12M8 16h8",
    alignRight: "M20 4v16M6 8h10M10 16h6",
    alignTop: "M4 4h16M8 8v10M16 8v6",
    alignMiddle: "M4 12h16M8 6v12M16 8v8",
    alignBottom: "M4 20h16M8 6v10M16 10v6",
    textLeft: "M4 6h16M4 10h10M4 14h16M4 18h10",
    textCenter: "M4 6h16M7 10h10M4 14h16M7 18h10",
    textRight: "M4 6h16M10 10h10M4 14h16M10 18h10",
    vTop: "M5 4h14M12 8v12M8 12l4-4 4 4",
    vMiddle: "M5 12h14M12 3v5M12 16v5M9 6l3 2 3-2M9 18l3-2 3 2",
    vBottom: "M5 20h14M12 4v12M8 12l4 4 4-4",
    bold: "M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z",
    italic: "M10 5h8M6 19h8M14 5l-4 14",
    underline: "M7 4v7a5 5 0 0010 0V4M5 20h14",
    rotate: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
    layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
    field: "M8 5c-2 0-2 2-2 3.5S5 11 4 12c1 1 2 1.5 2 3.5S6 19 8 19M16 5c2 0 2 2 2 3.5s1 2.5 2 3.5c-1 1-2 1.5-2 3.5s0 3.5-2 3.5",
    hash: "M9 4L7 20M17 4l-2 16M4 9h16M3 15h16",
    sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z",
    help: "M12 3a9 9 0 110 18 9 9 0 010-18zM9.5 9a2.5 2.5 0 114 2c-.9.6-1.5 1.2-1.5 2.5M12 17h.01",
    clipboard: "M9 4h6v3H9zM7 5H5v16h14V5h-2",
    numbers: "M5 8l2-2v12M10.5 8.5a2 2 0 013.5 1.5c0 2-3.5 3.5-3.5 6h4M17 7h3l-2 4a2.5 2.5 0 11-1.5 4.5"
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
    name: IconName;
    /** An accessible name; omit for a decorative icon. */
    title?: string;
}

export function Icon({ name, title, className, ...rest }: IconProps) {
    return (
        <svg
            {...rest}
            className={className ? `lp-icon ${className}` : "lp-icon"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden={title ? undefined : true}
            role={title ? "img" : undefined}
            focusable="false"
        >
            {title ? <title>{title}</title> : null}
            <path d={PATHS[name]} />
        </svg>
    );
}

function Bubbles() {
    // tiny subtle bubbles/spinner for WORKING (CSS only)
    return (
        <> 
            <div className="bub bub-1" />
            <div className="bub bub-2" />
            <div className="bub bub-3" />
            <style jsx>{` 
                .bub {
                    position: absolute;
                    bottom: 6px;
                    width: 6px;
                    height: 6px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.30);
                    filter: blur(0px);
                    opacity: 0;
                    animation: bubble 1.1s ease-in-out infinite;
                }
                .bub-1 {
                    left: 10px;
                    animation-delay: 0ms;
                }
                .bub-2 {
                    left: 24px;
                    animation-delay: 180ms;
                }
                .bub-3 {
                    left: 38px;
                    animation-delay: 360ms;
                }
                @keyframes bubble {
                    0% { transform: translateY(0); opacity: 0; }
                    30% { opacity: 0.65; }
                    80% { opacity: 0.15; }
                    100% { transform: translateY(-16px); opacity: 0; }
                }
            `}</style>
        </>
    );
}

export default Bubbles;
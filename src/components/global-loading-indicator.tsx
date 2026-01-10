'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export function GlobalLoadingIndicator() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [loadingKey, setLoadingKey] = useState('');

    // Track navigation changes
    useEffect(() => {
        const key = pathname + searchParams.toString();

        // When key changes, we've finished loading
        if (loadingKey && loadingKey !== key) {
            setIsLoading(false);
        }
        setLoadingKey(key);
    }, [pathname, searchParams, loadingKey]);

    // Listen for link clicks to start loading
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a[href]');

            if (link && link instanceof HTMLAnchorElement) {
                const href = link.getAttribute('href');
                // Only internal links
                if (href && href.startsWith('/') && !href.startsWith('//')) {
                    setIsLoading(true);
                }
            }
        };

        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    if (!isLoading) return null;

    return (
        <>
            {/* Top loading bar */}
            <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-primary/20">
                <div className="h-full bg-primary animate-pulse"
                    style={{
                        animation: 'loading-progress 2s ease-in-out infinite',
                        width: '100%'
                    }}
                />
            </div>

            {/* Center spinner overlay for mobile */}
            <div className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none md:hidden">
                <div className="bg-white/90 backdrop-blur-sm rounded-full p-4 shadow-lg">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </div>

            <style jsx global>{`
                @keyframes loading-progress {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </>
    );
}

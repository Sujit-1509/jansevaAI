import { useEffect, useState } from 'react';

const DEFAULT_LOCATION = {
    latitude: 18.5204,
    longitude: 73.8567,
    address: 'Pune, Maharashtra (default)',
};

export function useCurrentLocation() {
    const [location, setLocation] = useState({
        latitude: null,
        longitude: null,
        address: 'Detecting location...',
    });

    useEffect(() => {
        if (!navigator.geolocation) {
            setLocation(DEFAULT_LOCATION);
            return;
        }

        let cancelled = false;

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                if (cancelled) return;

                const latitude = pos.coords.latitude;
                const longitude = pos.coords.longitude;
                let address = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                    );
                    const data = await res.json();
                    if (!cancelled && data?.display_name) {
                        address = data.display_name;
                    }
                } catch (error) {
                    console.error('Reverse geocoding failed', error);
                }

                if (!cancelled) {
                    setLocation({ latitude, longitude, address });
                }
            },
            () => {
                if (!cancelled) {
                    setLocation(DEFAULT_LOCATION);
                }
            }
        );

        return () => {
            cancelled = true;
        };
    }, []);

    return location;
}

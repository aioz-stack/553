import { useEffect, useRef } from 'react';

/**
 * ApexCharts wrapper. The chart library (~1 MB) is loaded on demand when a chart mounts, so the
 * page around it renders first instead of waiting for the library to download.
 */
export default function ApexChart({ options, className, id }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    let cancelled = false;

    import('apexcharts').then(({ default: ApexCharts }) => {
      if (cancelled || !containerRef.current) {
        return;
      }
      chartRef.current = new ApexCharts(containerRef.current, options);
      chartRef.current.render();
    });

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
    // Options are static configs; serialising them keeps the effect honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options)]);

  return <div id={id} ref={containerRef} className={className} />;
}

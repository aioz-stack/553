import PageShell from '../../Components/PageShell';
import { Button, Card } from '../../Components/ui';
import { useTheme } from '../../lib/ThemeContext';

/** Account Settings (every web role): appearance. */
export default function Settings() {
  const { isDark, toggle } = useTheme();

  return (
    <PageShell title="Settings">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Appearance">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">Dark mode</span>
            <Button variant="outline" size="sm" onClick={toggle}>
              {isDark ? 'On' : 'Off'}
            </Button>
          </div>
          <p className="mt-4 text-xs text-gray-500">Times are shown in your device's time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
        </Card>
      </div>
    </PageShell>
  );
}

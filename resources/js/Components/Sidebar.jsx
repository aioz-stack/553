import { Link, usePage } from '@inertiajs/react';
import { IconMenuDots } from './Icons';
import { homePathFor, navigationFor } from '../lib/navigation';

/**
 * Baseplate sidebar. Menu groups are role-specific (see lib/navigation.ts):
 * players, agents and staff each get their own navigation, and staff items
 * are filtered by the administrator's granted abilities.
 */
export default function Sidebar({ sidebarToggle }) {
  const { url, props } = usePage();
  const user = props.auth?.user ?? null;
  const groups = navigationFor(user);
  const [currentPath, currentQuery = ''] = url.split('?');

  const roots = ['/admin', '/agent', '/dashboard'];

  const isActive = (href) => {
    const [path, query] = href.split('?');

    if (query) {
      return currentPath === path && currentQuery.includes(query);
    }

    if (roots.includes(path) || path === '/agent/players') {
      return currentPath === path && (path !== '/admin/wallets' || !currentQuery.includes('currency='));
    }

    if (path === '/admin/wallets' && currentQuery.includes('currency=')) {
      return false;
    }

    return currentPath === path || currentPath.startsWith(`${path}/`);
  };

  return (
    <aside
      className={`sidebar fixed left-0 top-0 z-9999 flex h-screen w-[290px] flex-col overflow-y-hidden border-r border-gray-200 bg-white px-5 dark:border-gray-800 dark:bg-black lg:static lg:translate-x-0 ${
        sidebarToggle ? 'translate-x-0 lg:w-[90px]' : '-translate-x-full'
      }`}
    >
      {/* SIDEBAR HEADER */}
      <div
        className={`sidebar-header flex items-center gap-2 pb-7 pt-8 ${
          sidebarToggle ? 'justify-center' : 'justify-between'
        }`}
      >
        <Link href={homePathFor(user)}>
          <span className={`logo ${sidebarToggle ? 'hidden' : ''}`}>
            <img className="dark:hidden" src="/images/logo/pusoy-logo.svg" alt="Logo" />
            <img className="hidden dark:block" src="/images/logo/pusoy-logo-dark.svg" alt="Logo" />
          </span>

          <img
            className={`logo-icon ${sidebarToggle ? 'lg:block' : 'hidden'}`}
            src="/images/logo/pusoy-icon.svg"
            alt="Logo"
          />
        </Link>
      </div>
      {/* SIDEBAR HEADER */}

      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav>
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-4 text-xs uppercase leading-[20px] text-gray-400">
                <span className={`menu-group-title ${sidebarToggle ? 'lg:hidden' : ''}`}>{group.title}</span>

                <IconMenuDots
                  className={`mx-auto fill-current menu-group-icon ${
                    sidebarToggle ? 'hidden lg:block' : 'hidden'
                  }`}
                />
              </h3>

              <ul className="mb-6 flex flex-col gap-1">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className={`menu-item group ${active ? 'menu-item-active' : 'menu-item-inactive'}`}
                      >
                        <Icon className={active ? 'menu-item-icon-active' : 'menu-item-icon-inactive'} />

                        <span className={`menu-item-text ${sidebarToggle ? 'lg:hidden' : ''}`}>
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

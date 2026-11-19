<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root Blade template that renders the React application.
     */
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Props shared with every page. Never includes wallet balances or other
     * players' data — pages fetch those from /api/v1 with policy checks.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return array_merge(parent::share($request), [
            'auth' => [
                'user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'username' => $user->username,
                    'email' => $user->email,
                    'role' => $user->role->value,
                    'role_label' => $user->role->label(),
                    'abilities' => $user->abilityKeys(),
                    'profile_picture' => $user->profile_picture,
                    // player | agent | master | silver | admin, and the saved web theme (light | dark | null).
                    'account_type' => $user->accountType(),
                    'account_type_label' => $user->accountTypeLabel(),
                    'theme' => is_array($user->preferences) ? ($user->preferences['theme'] ?? null) : null,
                ] : null,
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
            ],
            'features' => fn () => config('pusoy.features'),
            'reverb' => ['enabled' => config('broadcasting.default') === 'reverb'],
        ]);
    }
}

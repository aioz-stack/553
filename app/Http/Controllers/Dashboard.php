<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Auth\Login;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class Dashboard extends Controller
{
    /**
     * Players get the player dashboard; agents and staff are sent to theirs.
     */
    public function index(Request $request): Response|RedirectResponse
    {
        $user = $request->user();

        if (! $user->isPlayer()) {
            return redirect()->to(Login::homeFor($user));
        }

        return Inertia::render('Dashboard');
    }
}

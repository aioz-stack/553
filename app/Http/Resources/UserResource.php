<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Support\Level;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'email' => $this->when($request->user()?->can('view', $this->resource), $this->email),
            'phone' => $this->when($request->user()?->can('view', $this->resource), $this->phone),
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'status' => $this->status->value,
            'profile_picture' => $this->profile_picture,
            'display_name' => $this->whenLoaded('profile', fn () => $this->profile?->display_name),
            'level' => $this->whenLoaded('profile', fn () => Level::fromXp((int) ($this->profile?->xp ?? 0))),
            'abilities' => $this->when($request->user()?->id === $this->id, fn () => $this->abilityKeys()),
            // Your own game settings (BGM, sound effects, motion quality) — only on your own record.
            'preferences' => $this->when($request->user()?->id === $this->id, fn () => $this->resource->gamePreferences()),
            'permissions' => $this->whenLoaded('permissions', fn () => $this->permissions->pluck('key')->values()),
            'agent' => $this->whenLoaded('agent', fn () => $this->agent ? ['id' => $this->agent->id, 'code' => $this->agent->code, 'status' => $this->agent->status] : null),
            'owning_agent' => $this->whenLoaded('agentLink', fn () => $this->agentLink ? [
                'agent_id' => $this->agentLink->agent_id,
                'name' => $this->agentLink->agent?->user?->name,
            ] : null),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

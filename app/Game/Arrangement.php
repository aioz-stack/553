<?php

namespace App\Game;

/**
 * A player's Front (3), Middle (5) and Back (5) hands with their evaluated
 * strengths. A "foul" is an arrangement where Back < Middle or Middle < Front.
 */
final class Arrangement
{
    public readonly HandValue $frontValue;

    public readonly HandValue $middleValue;

    public readonly HandValue $backValue;

    /**
     * @param  list<string>  $front
     * @param  list<string>  $middle
     * @param  list<string>  $back
     */
    public function __construct(
        public readonly array $front,
        public readonly array $middle,
        public readonly array $back,
    ) {
        $this->frontValue = HandEvaluator::evaluate($front);
        $this->middleValue = HandEvaluator::evaluate($middle);
        $this->backValue = HandEvaluator::evaluate($back);
    }

    public function isFoul(): bool
    {
        return $this->backValue->compare($this->middleValue) < 0
            || $this->middleValue->compare($this->frontValue) < 0;
    }

    public function value(string $position): HandValue
    {
        return match ($position) {
            'front' => $this->frontValue,
            'middle' => $this->middleValue,
            'back' => $this->backValue,
        };
    }

    /**
     * @return list<string>
     */
    public function allCards(): array
    {
        return [...$this->front, ...$this->middle, ...$this->back];
    }

    /**
     * @return array{front: string, middle: string, back: string}
     */
    public function labels(): array
    {
        return [
            'front' => $this->frontValue->label(),
            'middle' => $this->middleValue->label(),
            'back' => $this->backValue->label(),
        ];
    }
}

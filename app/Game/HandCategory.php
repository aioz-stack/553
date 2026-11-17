<?php

namespace App\Game;

/**
 * Hand categories on one shared scale so Front (3-card) hands can be
 * compared with Middle (5-card) hands when validating arrangement order.
 * A Front hand can only ever be HighCard, OnePair or ThreeOfAKind.
 */
enum HandCategory: int
{
    case HighCard = 0;
    case OnePair = 1;
    case TwoPair = 2;
    case ThreeOfAKind = 3;
    case Straight = 4;
    case Flush = 5;
    case FullHouse = 6;
    case FourOfAKind = 7;
    case StraightFlush = 8;
    case RoyalFlush = 9;

    public function label(): string
    {
        return match ($this) {
            self::HighCard => 'High Card',
            self::OnePair => 'One Pair',
            self::TwoPair => 'Two Pair',
            self::ThreeOfAKind => 'Three of a Kind',
            self::Straight => 'Straight',
            self::Flush => 'Flush',
            self::FullHouse => 'Full House',
            self::FourOfAKind => 'Four of a Kind',
            self::StraightFlush => 'Straight Flush',
            self::RoyalFlush => 'Royal Flush',
        };
    }
}

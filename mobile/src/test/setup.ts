import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Screens draw every card as detailed SVG art, so the DOM is large and role queries take longer under
// load than testing-library's 1 s default allows. Give findBy*/waitFor more room (they still resolve
// as soon as the element appears).
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

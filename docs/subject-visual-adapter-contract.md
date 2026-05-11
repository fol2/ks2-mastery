# Subject Visual Adapter Contract

Visual Engine v1 exposes a read-only `SubjectVisualAdapter` metadata shape for every registered subject.

Ready subjects (`spelling`, `grammar`, `punctuation`, `reading`, `reasoning`) declare how their setup scene, session HUD, companion panel, practice stage, and summary frame map into the shared Visual Engine primitives.

Placeholder subjects (`arithmetic`) declare the same sections as unavailable. They must not expose production practice controls, Worker command handlers, or browser-only subject engines until a subject-specific launch contract makes them ready.

The adapter is display metadata. Subject-owned learning logic, marking, scheduling, rewards, Stars, and Worker command handling remain in the subject modules and services.

module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['dist', 'android', 'ios', '.expo', 'coverage', 'scripts/*.mjs'],
  rules: { 'no-console': ['warn', { allow: ['warn', 'error'] }] },
};

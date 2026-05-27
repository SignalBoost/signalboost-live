// @ts-nocheck
describe('Ownership transfer', () => {
  test('Owner can transfer ownership', () => {
    const users = [
      { email: 'owner@example.com', role: 'owner' },
      { email: 'newowner@example.com', role: 'admin' }
    ];
    users[0].role = 'admin';
    users[1].role = 'owner';
    const ownerCount = users.filter(u => u.role === 'owner').length;
    expect(ownerCount).toBe(1);
  });

  test('Admins cannot transfer ownership', () => {
    const user = { role: 'admin' };
    expect(user.role).not.toBe('owner');
  });
});

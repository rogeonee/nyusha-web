import type { Chat } from '@/lib/db/schema';

type ChatGroup = {
  label: string;
  chats: Chat[];
};

export function groupChatsByDate(chats: Chat[]): ChatGroup[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOf7Days = new Date(startOfToday.getTime() - 7 * 86_400_000);
  const startOf30Days = new Date(startOfToday.getTime() - 30 * 86_400_000);

  const buckets: ChatGroup[] = [
    { label: 'Сегодня', chats: [] },
    { label: 'Вчера', chats: [] },
    { label: 'Последние 7 дней', chats: [] },
    { label: 'Последние 30 дней', chats: [] },
    { label: 'Ранее', chats: [] },
  ];

  for (const chat of chats) {
    const created = new Date(chat.createdAt);

    if (created >= startOfToday) {
      buckets[0].chats.push(chat);
    } else if (created >= startOfYesterday) {
      buckets[1].chats.push(chat);
    } else if (created >= startOf7Days) {
      buckets[2].chats.push(chat);
    } else if (created >= startOf30Days) {
      buckets[3].chats.push(chat);
    } else {
      buckets[4].chats.push(chat);
    }
  }

  return buckets.filter((group) => group.chats.length > 0);
}

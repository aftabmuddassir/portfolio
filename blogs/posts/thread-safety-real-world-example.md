---
title: Understanding Thread Safety: A Real-World Example from Hifdh Quest
date: 2026-01-17
canonical:
description: Learn about thread safety in Java through a real-world example from building Hifdh Quest, an ed-tech quiz game. Explore solutions using AtomicInteger, synchronized, database locking, and Redis.
tags: ["Java", "Thread Safety", "Concurrency", "Backend"]
readTime: 7 min read
---

# Understanding Thread Safety: A Real-World Example from Hifdh Quest

Thread safety is one of those concepts that seems abstract until we encounter a real-world bug. In this blog, I'll share what I learned about thread safety while building Hifdh Quest, and the different approaches to solving race conditions in Java applications.

## The Problem: How Do We Make Sure Our Code is Thread Safe?

When we build high-scale applications in an enterprise language like Java, there can be instances where 2 different users are getting the same document number, same rank when thier transactions are happening concurrently.

For instance, I created this hobby ed-tech project based on Quran memorization called **Hifdh Quest**, where we have an admin and a few players. The admin displays a verse and whichever player knows the answer needs to press the buzzer. Based on this, the player gets points and is ranked.

### Quick Glance: How Hifdh Quest Works

This game can be played with 1 admin and at least 1 player, designed to make revising the Qur'an interactive and enjoyable.

**Game Link:** [https://hifdhquest.aftabmuddassir.com/](https://hifdhquest.aftabmuddassir.com/)

**Vocabulary**
Surah: Chapter
Ayah: Verse

**Types of Questions:**
- Guess the Surah
- Guess the Meaning
- Guess the Next Ayah
- Guess the Previous Ayah

**How the Game Works:**
1. The admin creates a game and shares the link with players
2. The admin chooses one of the four question types during game creation
3. Once players join, they will see a buzzer on their screen
4. After all players have joined, the admin starts the game
5. The game can have as many rounds as the admin decides

**For each round:**
- A random ayah is played from the portion of the Qur'an selected by the admin during game creation
- Players can press the buzzer if they know the answer
- Even if someone has already buzzed in, others can still press the buzzer
- If the first player answers incorrectly, the next player gets a chance

### The Technical Challenge

In the JVM, data is stored either in the **heap** (shared memory where all the threads can see it) or **stack** (specific to each thread).

When we use the `@Service` annotation on a java class my `BuzzerService`, it creates a singleton class (initialized once when the application starts and all the threads see the same bean).

```java
@Service // <--- Spring makes this a Singleton i.e only 1 instance exists in memory)
public class BuzzerService { ... }
```

If we declare the variable `private int currentBuzzRank = 0` and then increment it in the method as `currentBuzzRank++` for each player, this variable has shared mutable state visible to all the threads and we can get the same ranks for different players who click the buzzer at the same time.

**How to avoid it?**

## Solution 1: Using an Atomic Integer

```java
private AtomicInteger totalBuzzes = new AtomicInteger(0);

public void handle() {
    totalBuzzes.incrementAndGet();
}
```

### How It Works
`AtomicInteger` uses low-level CPU instructions (CAS - Compare And Swap) to increment numbers. Best for simple counters or flags.

**Pros:** Very fast, high performance.

**Cons:** If the application has >1 servers, then each server can have its own atomic integer leading to the same ranks for different players.

## Solution 2: Using the synchronized Keyword

```java
private int totalBuzzes = 0;

// safe: The 'synchronized' keyword locks this method
public synchronized int handle() {
    totalBuzzes++;
    return totalBuzzes;
}
```

The `synchronized` keyword acts like a traffic light. It forces threads to form a single-file line. Only one thread can enter the method at a time.

### How It Works
Thread A enters the method. Thread B tries to enter but sees the door is locked. It must wait until Thread A finishes.

**Pros:** Easy  implementation. Guarantees safety for complex logic blocks.

**Cons:** Slower. If the method takes a long time like calling a database, all other threads get stuck waiting.

## Solution 3: Accessing the Source of Truth (DB)

```java
public BuzzerPressedEvent handleBuzzerPress(BuzzerPressRequest request) {
    // ...
    // Fetch state from the DB
    int buzzRank = buzzerPressRepository.getNextBuzzRank(round.getId());
    BuzzerPress buzzerPress = new BuzzerPress();
    buzzerPress.setBuzzRank(buzzRank);
    buzzerPressRepository.save(buzzerPress);
}
```

We access data directly from the DB which is always reliable.

### The Issue
One issue with the above approach is there's still a race condition based on the logic, though the memory race condition is avoided.

Here's the code explanation:

```java

int buzzRank = buzzerPressRepository.getNextBuzzRank(round.getId());


BuzzerPress buzzerPress = new BuzzerPress();
buzzerPress.setBuzzRank(buzzRank);
buzzerPressRepository.save(buzzerPress);
```

**The Issue:**

1. Thread A calls `getNextBuzzRank` → DB returns 1.
2. Thread B calls `getNextBuzzRank` → DB returns 1 (because Thread A hasn't saved yet).
3. Thread A saves rank = 1.
4. Thread B saves rank = 1.

Now we have 2 players with Rank 1.

### The Fix
This can be avoided by adding **database locking** at the table level by adding constraints on attributes like buzz rank, round number.

**Pros:** Safest way to avoid errors.

**Cons:** Very slow and not ideal for a quick game like this.

## Quick Comparison

| Approach | Performance | Scalability | Complexity |
|----------|-------------|-------------|------------|
| AtomicInteger |  Very Fast |  Single server only |  Very simple |
| Synchronized |  Slower |  Single server only |  Simple |
| Database Locking |  Slowest |  Multi-server |  Medium |
| Redis |  Very Fast |  Multi-server |  Requires setup |

## The Pro Solution: Redis 
Since the database approach is slow, We can use a Redis for this case.

**The Solution:** Redis

In a time-sensitive application like this, querying the buzzer rank from the database is a slow solution and not scalable in the long run.

Redis is an in-memory data store like a giant HashMap that lives on its own server. It's shared like a Database but lives in RAM, making it orders of magnitude faster than disk-based databases. It handles buzzer logic in **microseconds** and not **milliseconds**.

### Why Redis is Perfect for This Use Case

```java
// Redis atomic increment - blazing fast!
public int handleBuzzerPress(String roundId) {
    String key = "round:" + roundId + ":buzzRank";
    return redisTemplate.opsForValue().increment(key).intValue();
}
```

Redis's `INCR` command is:
- **Atomic** (thread-safe by design)
- **Fast** (in-memory operation)
- **Scalable** (works across multiple servers)
- **Simple** (one line of code)

## Conclusion

Thread safety isn't just theoretical, it directly impacts user experience. For Hifdh Quest, I started with `synchronized` methods for simplicity, but I'm planning to migrate to Redis for better performance as the user base grows.

**The key takeaway?** We always need to think about where our data lives (heap vs stack) and how multiple threads might access it simultaneously. Then we choose the solution that fits our scale and latency requirements.

For a hobby project with low traffic, `synchronized` works fine. For a production app with thousands of concurrent users, Redis or distributed locking becomes essential.

---

**What's your experience with thread safety issues?** Have you encountered race conditions in production? I'd love to hear your stories and solutions!

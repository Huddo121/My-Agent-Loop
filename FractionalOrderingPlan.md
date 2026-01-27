# Fractional Ordering

I'd like to add the ability for a user to reorder items in the queue.

I desire the following behaviour:

1. A newly added task will be added to the end of the queue
2. A user can drag and drop tasks to reorder them
3. When task processing begins then the tasks are taken in position order
4. Tasks must be returned to the UI in the position order

# Work already done

I've added the `move` API for you in `tasks-api.ts`, it supports absolute and relative positioning types.
I've already set up the schema in `schema.ts`.
I've added the method to the `TaskQueue` interface

## Implementation details

I'd like to use fractional ordering, but don't want to let the precision of javascript numbers bite me, so we'll use a "large" integer gap between tasks to begin with (128). This should allow for a lot of splitting before we need to worry about decimals, giving us heaps of headroom before we need to even consider rebalancing.

Once a task is completed its position can be removed, it is no longer needed and does not get returned to the frontend any more anyway.

# Work to **NOT** do

- Rebalancing. We should have enough headroom to not worry about it for a bit.

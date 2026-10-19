package com.safenest.app.vpn

/**
 * Decision that the DNS filter makes for a given hostname.
 *
 * This is a pure value: no Android, I/O or network dependencies, so it can be
 * unit-tested and used by the in-app debug screen with no side effects.
 */
sealed interface FilterDecision {
    fun describe(): String

    data object Allowed : FilterDecision {
        override fun describe() = "ALLOWED"
    }

    data object Dropped : FilterDecision {
        override fun describe() = "DROPPED (malformed)"
    }

    data class Blocked(val reason: BlockReason) : FilterDecision {
        override fun describe(): String = when (reason) {
            BlockReason.ADULT_LIST -> "BLOCKED (adult list)"
            BlockReason.CUSTOM_BLACKLIST -> "BLOCKED (custom blacklist)"
            BlockReason.ENCRYPTED_DNS -> "BLOCKED (DoH/DoT endpoint)"
        }
    }

    data class Rewritten(val target: String) : FilterDecision {
        override fun describe() = "REWRITTEN (SafeSearch -> $target)"
    }
}

enum class BlockReason {
    ADULT_LIST,
    CUSTOM_BLACKLIST,
    ENCRYPTED_DNS
}

/**
 * Pure decision logic for a DNS hostname. No Android or network dependencies, so
 * it can be unit tested and used by the in-app debug screen.
 */
class FilterPolicy(
    adultDomains: DomainStore?,
    whitelist: Set<String>,
    blacklist: Set<String>
) {

    private val adultList: DomainStore = adultDomains ?: DomainStore.fromDomains(FallbackBlocklist.DOMAINS)
    private val whiteList: DomainStore = DomainStore.fromDomains(whitelist)
    private val blackList: DomainStore = DomainStore.fromDomains(blacklist)

    fun classify(host: String): FilterDecision {
        val normalized = host.trim().trim('.').lowercase()
        if (normalized.isEmpty()) return FilterDecision.Dropped

        if (whiteList.contains(normalized)) return FilterDecision.Allowed
        if (BypassBlocklist.isBlockedHost(normalized)) {
            return FilterDecision.Blocked(BlockReason.ENCRYPTED_DNS)
        }
        if (blackList.contains(normalized)) {
            return FilterDecision.Blocked(BlockReason.CUSTOM_BLACKLIST)
        }
        if (adultList.contains(normalized)) {
            return FilterDecision.Blocked(BlockReason.ADULT_LIST)
        }

        val target = SafeSearch.targetFor(normalized)
        if (target != null) {
            return FilterDecision.Rewritten(target)
        }

        return FilterDecision.Allowed
    }
}

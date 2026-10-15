package com.safenest.app.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.safenest.app.MainActivity
import com.safenest.app.R
import com.safenest.app.data.AppPrefs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The protection engine.
 *
 * It establishes a tun interface that captures *only* DNS traffic (plus the IPs
 * of known encrypted-DNS resolvers, which are dropped). Every DNS query is run
 * through [DnsEngine]; the reply is written back into the tunnel.
 *
 * Because the interface does not carry general internet traffic it never has to
 * forward TCP/UDP streams, which keeps the service small and battery friendly.
 */
class SafeNestVpnService : VpnService() {

    private var tunInterface: ParcelFileDescriptor? = null
    private var engine: DnsEngine? = null
    private var pumpJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val stopping = AtomicBoolean(false)

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Must go foreground promptly after startForegroundService().
        startForeground(NOTIFICATION_ID, buildNotification())

        if (intent?.action == ACTION_STOP) {
            teardown()
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }

        if (pumpJob == null) startTunnel()
        return START_STICKY
    }

    override fun onRevoke() {
        // The user or another VPN disabled us system-side.
        AppPrefs(this).protectionEnabled = false
        teardown()
        stopForegroundCompat()
        stopSelf()
        super.onRevoke()
    }

    override fun onDestroy() {
        teardown()
        scope.cancel()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- tunnel

    private fun startTunnel() {
        stopping.set(false)
        val prefs = AppPrefs(this)

        val builder = Builder()
            .setSession(SESSION_NAME)
            .setMtu(MTU)
            .addAddress(FAKE_DNS_V4, 32)
            .addDnsServer(FAKE_DNS_V4)
            .addRoute(FAKE_DNS_V4, 32)
            .addAddress(FAKE_DNS_V6, 128)
            .addDnsServer(FAKE_DNS_V6)
            .addRoute(FAKE_DNS_V6, 128)

        // Pull encrypted-DNS resolvers into the tunnel so we can drop them.
        BypassBlocklist.IPV4_ROUTES.forEach { route ->
            val (address, prefix) = route.split('/')
            builder.addRoute(address, prefix.toInt())
        }
        BypassBlocklist.IPV6_ROUTES.forEach { route ->
            val (address, prefix) = route.split('/')
            builder.addRoute(address, prefix.toInt())
        }

        val iface = try {
            builder.establish()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to establish tunnel", e)
            null
        }

        if (iface == null) {
            // Consent was revoked or another VPN is active: reflect reality in the UI.
            Log.w(TAG, "establish() returned null - consent missing or VPN conflict")
            AppPrefs(this).protectionEnabled = false
            running.value = false
            stopForegroundCompat()
            stopSelf()
            return
        }

        tunInterface = iface
        val dns = DnsEngine(
            store = DomainStore.load(this),
            whitelist = prefs.whitelist,
            blacklist = prefs.blacklist,
            protectSocket = { socket -> protect(socket) }
        )
        engine = dns
        blockedCount.value = 0
        running.value = true

        pumpJob = scope.launch { pump(iface, dns) }
    }

    /** Reads packets from the tun device until the service stops. */
    private suspend fun pump(iface: ParcelFileDescriptor, dns: DnsEngine) {
        val input = FileInputStream(iface.fileDescriptor)
        val output = FileOutputStream(iface.fileDescriptor)
        val buffer = ByteArray(MAX_PACKET_SIZE)

        try {
            while (currentCoroutineContext().isActive && !stopping.get()) {
                val length = input.read(buffer)
                if (length <= 0) continue

                val reply = handlePacket(buffer, length, dns) ?: continue
                output.write(reply)
                blockedCount.value = dns.blockedCount
            }
        } catch (e: Exception) {
            // Reading fails when the interface is closed during teardown; that is expected.
            if (!stopping.get()) Log.w(TAG, "Tunnel read loop ended", e)
        } finally {
            runCatching { input.close() }
            runCatching { output.close() }
        }
    }

    /**
     * Handles one packet from the tunnel.
     *
     * Anything that is not a DNS query to our fake resolver is, by construction,
     * traffic to a black-holed encrypted-DNS IP, so it is dropped.
     */
    private fun handlePacket(packet: ByteArray, length: Int, dns: DnsEngine): ByteArray? {
        val parsed = IpPacket.parse(packet, length) ?: return null
        if (parsed.protocol != IpPacket.PROTO_UDP) return null
        if (parsed.destinationPort != DNS_PORT) return null
        if (!isFakeResolver(parsed.destinationAddress)) return null

        val reply = dns.process(parsed.payload) ?: return null
        return IpPacket.buildUdpReply(parsed, reply)
    }

    private fun isFakeResolver(address: ByteArray): Boolean =
        address.contentEquals(fakeResolverV4) || address.contentEquals(fakeResolverV6)

    private fun teardown() {
        stopping.set(true)
        pumpJob?.cancel()
        pumpJob = null
        runCatching { tunInterface?.close() }
        tunInterface = null
        engine?.close()
        engine = null
        running.value = false
    }

    // ---------------------------------------------------------- notification

    private fun buildNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, SafeNestVpnService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(R.drawable.ic_shield)
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openIntent)
            .addAction(0, getString(R.string.notif_stop), stopIntent)
            .build()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.notif_channel),
                    NotificationManager.IMPORTANCE_LOW
                )
            )
        }
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
    }

    companion object {
        private const val TAG = "SafeNestVpn"
        private const val ACTION_STOP = "com.safenest.app.action.STOP"
        private const val CHANNEL_ID = "safenest_protection"
        private const val NOTIFICATION_ID = 1001
        private const val SESSION_NAME = "SafeNest"
        private const val MTU = 1500
        private const val MAX_PACKET_SIZE = 32767
        private const val DNS_PORT = 53

        /** Private, unlikely-to-collide addresses the tunnel pretends to serve DNS from. */
        private const val FAKE_DNS_V4 = "10.111.222.1"
        private const val FAKE_DNS_V6 = "fd00:53::1"

        private val FAKE_DNS_V4_IP = java.net.InetAddress.getByName(FAKE_DNS_V4)
        private val FAKE_DNS_V6_IP = java.net.InetAddress.getByName(FAKE_DNS_V6)

        private val fakeResolverV4: ByteArray = FAKE_DNS_V4_IP.address
        private val fakeResolverV6: ByteArray = FAKE_DNS_V6_IP.address

        /** Observable protection state, consumed by the UI. */
        val running = MutableStateFlow(false)

        /** Queries refused since protection was last switched on. */
        val blockedCount = MutableStateFlow(0L)

        fun start(context: Context) {
            val intent = Intent(context, SafeNestVpnService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, SafeNestVpnService::class.java).setAction(ACTION_STOP)
            ContextCompat.startForegroundService(context, intent)
        }
    }
}

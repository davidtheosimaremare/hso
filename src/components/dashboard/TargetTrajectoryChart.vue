<script setup>
import { ref, computed } from 'vue'
import { TrendingUp, Target, Flag, Calendar } from 'lucide-vue-next'

const props = defineProps({
  targetSalesData: { type: Object, required: true },
  isLoading: { type: Boolean, default: false }
})

const hoveredMonthIdx = ref(null)

const formatCurrency = (val) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0)
}

const formatCurrencyShort = (val) => {
  if (val === null || val === undefined) return '0'
  const abs = Math.abs(val)
  if (abs >= 1e9) return (val / 1e9).toFixed(1) + 'M'
  if (abs >= 1e6) return (val / 1e6).toFixed(0) + 'jt'
  return formatCurrency(val)
}

// Chart Layout Constants (SVG coordinate space 1000 x 420)
const svgWidth = 1000
const svgHeight = 420
const padLeft = 70
const padRight = 50
const padTop = 45
const padBottom = 55
const drawWidth = svgWidth - padLeft - padRight
const drawHeight = svgHeight - padTop - padBottom

const monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Target Maximum Y Value
const maxY = computed(() => {
  const target = props.targetSalesData?.yearlyTarget || 35_000_000_000
  const maxActual = props.targetSalesData?.monthlyBreakdown?.reduce((max, m) => Math.max(max, m.runCumulativeActual || 0), 0) || 0
  return Math.max(target, maxActual)
})

// Y Axis Grid Ticks (7 ticks: 0, 4M, 8M, ..., 24M)
const yTicks = computed(() => {
  const max = maxY.value
  const count = 6 // 6 intervals = 7 ticks
  const ticks = []
  for (let i = 0; i <= count; i++) {
    const val = (max / count) * i
    const y = svgHeight - padBottom - (i / count) * drawHeight
    ticks.push({ val, y, label: formatCurrencyShort(val) })
  }
  return ticks
})

// X Coordinates for the 12 Months
const monthXCoords = computed(() => {
  return monthShortNames.map((_, idx) => {
    return padLeft + (idx / 11) * drawWidth
  })
})

// Coordinate conversion helpers
const getYCoord = (val) => {
  if (val === null || val === undefined) return svgHeight - padBottom
  const ratio = Math.min(1.1, Math.max(0, val / maxY.value))
  return svgHeight - padBottom - ratio * drawHeight
}

// 1. Diagonal Target Line Coordinates
const targetLinePoints = computed(() => {
  const breakdown = props.targetSalesData?.monthlyBreakdown || []
  if (breakdown.length === 0) return ''

  return breakdown.map((m, idx) => {
    const x = monthXCoords.value[idx]
    const y = getYCoord(m.runCumulativeTarget)
    return `${x},${y}`
  }).join(' ')
})

// 2. Cumulative Actual Line Coordinates (Plot up to current elapsed month or months with data)
const currentMonthIdx = new Date().getMonth()
const currentYear = new Date().getFullYear()

const actualLinePoints = computed(() => {
  const breakdown = props.targetSalesData?.monthlyBreakdown || []
  if (breakdown.length === 0) return []

  const isCurrentYear = props.targetSalesData?.year === currentYear
  const maxIndexToPlot = isCurrentYear ? currentMonthIdx : 11

  const points = []
  for (let idx = 0; idx <= maxIndexToPlot; idx++) {
    const m = breakdown[idx]
    if (!m) continue
    const x = monthXCoords.value[idx]
    const y = getYCoord(m.runCumulativeActual)
    points.push({ x, y, idx, data: m })
  }
  return points
})

const actualPolylineString = computed(() => {
  return actualLinePoints.value.map(p => `${p.x},${p.y}`).join(' ')
})

const actualAreaPathString = computed(() => {
  const points = actualLinePoints.value
  if (points.length === 0) return ''
  const firstX = points[0].x
  const lastX = points[points.length - 1].x
  const bottomY = svgHeight - padBottom
  const linePath = points.map(p => `${p.x},${p.y}`).join(' L ')
  return `M ${firstX},${bottomY} L ${linePath} L ${lastX},${bottomY} Z`
})

const hoveredData = computed(() => {
  if (hoveredMonthIdx.value === null) return null
  const breakdown = props.targetSalesData?.monthlyBreakdown || []
  return breakdown[hoveredMonthIdx.value] || null
})
</script>

<template>
  <div class="rounded-xl border border-border bg-card p-6 shadow-2xs space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <div class="p-1.5 bg-primary/10 rounded-lg text-primary">
            <TrendingUp class="w-4 h-4" />
          </div>
          <h3 class="font-bold text-foreground text-base tracking-tight">
            Perjalanan Target Penjualan {{ targetSalesData?.year }}
          </h3>
        </div>
        <p class="text-xs text-muted-foreground">
          Grafik trajektori pencapaian kumulatif menuju target tahunan {{ formatCurrencyShort(targetSalesData?.yearlyTarget) }}
        </p>
      </div>

      <!-- Legend Indicator -->
      <div class="flex items-center gap-4 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="w-5 h-0.5 bg-foreground border border-foreground rounded"></span>
          <span class="text-muted-foreground font-medium">Garis Target ({{ formatCurrencyShort(targetSalesData?.yearlyTarget) }})</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-600"></span>
          <span class="text-foreground font-semibold">Realisasi Kumulatif (YTD)</span>
        </div>
      </div>
    </div>

    <!-- Chart Container -->
    <div class="relative w-full overflow-hidden select-none">
      <div v-if="isLoading" class="flex flex-col justify-center items-center py-24 space-y-2">
        <div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs text-muted-foreground font-medium">Memuat grafik perjalanan target...</span>
      </div>

      <div v-else class="w-full">
        <!-- SVG Canvas -->
        <svg :viewBox="`0 0 ${svgWidth} ${svgHeight}`" class="w-full h-auto overflow-visible">
          <defs>
            <!-- Soft Green Gradient under Actual Line -->
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
            </linearGradient>
            <!-- Drop Shadow for Active Hover Circle -->
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.2" />
            </filter>
          </defs>

          <!-- 1. Horizontal Y-Axis Grid Lines & Ticks -->
          <g class="grid-lines">
            <g v-for="tick in yTicks" :key="tick.val">
              <line 
                :x1="padLeft" 
                :y1="tick.y" 
                :x2="svgWidth - padRight" 
                :y2="tick.y" 
                class="stroke-border" 
                stroke-dasharray="4 4" 
                stroke-width="1"
              />
              <text 
                :x="padLeft - 10" 
                :y="tick.y + 4" 
                text-anchor="end" 
                class="fill-muted-foreground text-[11px] font-medium"
              >
                {{ tick.label }}
              </text>
            </g>
          </g>

          <!-- 2. X-Axis Month Labels & Vertical Guide Lines -->
          <g class="x-axis">
            <g v-for="(mName, idx) in monthShortNames" :key="mName">
              <line 
                :x1="monthXCoords[idx]" 
                :y1="padTop" 
                :x2="monthXCoords[idx]" 
                :y2="svgHeight - padBottom" 
                class="stroke-border/40" 
                stroke-width="1"
              />
              <text 
                :x="monthXCoords[idx]" 
                :y="svgHeight - padBottom + 22" 
                text-anchor="middle" 
                :class="[
                  'text-[12px] font-medium transition-colors cursor-pointer',
                  hoveredMonthIdx === idx ? 'fill-foreground font-bold' : 'fill-muted-foreground'
                ]"
                @mouseenter="hoveredMonthIdx = idx"
                @mouseleave="hoveredMonthIdx = null"
              >
                {{ mName }}
              </text>
            </g>

            <!-- Base X Axis Line -->
            <line 
              :x1="padLeft" 
              :y1="svgHeight - padBottom" 
              :x2="svgWidth - padRight" 
              :y2="svgHeight - padBottom" 
              class="stroke-border" 
              stroke-width="1.5"
            />
          </g>

          <!-- 3. Ideal Diagonal Target Trajectory Line (Line from Jan to Dec Target) -->
          <polyline 
            :points="targetLinePoints" 
            fill="none" 
            class="stroke-foreground/80 dark:stroke-foreground/90" 
            stroke-width="2.5" 
            stroke-dasharray="6 4"
            stroke-linecap="round"
          />

          <!-- Target End Flag Marker at Dec -->
          <g :transform="`translate(${monthXCoords[11]}, ${getYCoord(targetSalesData?.yearlyTarget)})`">
            <circle r="4" class="fill-foreground" />
          </g>

          <!-- 4. Actual Cumulative Area & Trajectory Line -->
          <g v-if="actualLinePoints.length > 0">
            <!-- Gradient Fill Under Line -->
            <path :d="actualAreaPathString" fill="url(#actualGradient)" />

            <!-- Solid Emerald Line -->
            <polyline 
              :points="actualPolylineString" 
              fill="none" 
              stroke="#10b981" 
              stroke-width="3.5" 
              stroke-linecap="round" 
              stroke-linejoin="round"
            />

            <!-- Interactive Month Points (Dots) -->
            <g v-for="pt in actualLinePoints" :key="pt.idx">
              <!-- Point Circle (Static & Clean, No Animation) -->
              <circle 
                :cx="pt.x" 
                :cy="pt.y" 
                r="5.5" 
                fill="#10b981" 
                stroke="#ffffff" 
                stroke-width="2" 
                class="cursor-pointer"
                @mouseenter="hoveredMonthIdx = pt.idx"
                @mouseleave="hoveredMonthIdx = null"
              />

              <!-- Value Label over Point with White Text Halo (No Overlap Noise) -->
              <text 
                :x="pt.x" 
                :y="pt.y - 10" 
                text-anchor="middle" 
                class="fill-emerald-700 dark:fill-emerald-400 text-[11px] font-bold"
                stroke="#ffffff"
                stroke-width="3"
                paint-order="stroke fill"
              >
                {{ formatCurrencyShort(pt.data.runCumulativeActual) }}
              </text>
            </g>
          </g>

          <!-- Hover Vertical Guideline -->
          <line 
            v-if="hoveredMonthIdx !== null" 
            :x1="monthXCoords[hoveredMonthIdx]" 
            :y1="padTop" 
            :x2="monthXCoords[hoveredMonthIdx]" 
            :y2="svgHeight - padBottom" 
            class="stroke-primary" 
            stroke-width="1.5" 
            stroke-dasharray="3 3"
          />
        </svg>

        <!-- Floating Interactive Tooltip -->
        <div 
          v-if="hoveredData" 
          class="mt-3 p-3 bg-muted/50 border border-border rounded-lg flex flex-wrap items-center justify-between gap-4 text-xs"
        >
          <div class="flex items-center gap-2">
            <span class="font-bold text-foreground text-sm">{{ hoveredData.monthName }} {{ targetSalesData?.year }}</span>
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-background border border-border">
              {{ hoveredData.qtyMonthly }} SO
            </span>
          </div>

          <div class="flex items-center gap-6 flex-wrap">
            <div>
              <span class="text-muted-foreground">Target Kumulatif:</span>
              <span class="font-bold text-foreground ml-1.5">{{ formatCurrencyShort(hoveredData.runCumulativeTarget) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">Realisasi Kumulatif:</span>
              <span class="font-bold text-emerald-600 dark:text-emerald-400 ml-1.5">{{ formatCurrencyShort(hoveredData.runCumulativeActual) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">Penjualan Bulan Ini:</span>
              <span class="font-bold text-foreground ml-1.5">+{{ formatCurrencyShort(hoveredData.actualMonthly) }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">Posisi YTD:</span>
              <span class="font-bold ml-1.5" :class="hoveredData.varianceYTD >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
                {{ hoveredData.ytdStatus }} ({{ hoveredData.varianceYTD >= 0 ? '+' : '' }}{{ formatCurrencyShort(hoveredData.varianceYTD) }})
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

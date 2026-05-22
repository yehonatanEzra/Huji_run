def parse_time(s: str) -> int:
    """Convert 'MM:SS' or 'H:MM:SS' to total seconds."""
    parts = s.strip().split(":")
    if len(parts) == 2:
        m, sec = int(parts[0]), int(parts[1])
        if not (0 <= sec < 60):
            raise ValueError(f"Invalid seconds: {sec}")
        return m * 60 + sec
    if len(parts) == 3:
        h, m, sec = int(parts[0]), int(parts[1]), int(parts[2])
        if not (0 <= m < 60 and 0 <= sec < 60):
            raise ValueError(f"Invalid time: {s}")
        return h * 3600 + m * 60 + sec
    raise ValueError(f"Invalid time format: '{s}' — use MM:SS or H:MM:SS")


def seconds_to_display(total: int) -> str:
    """Convert total seconds back to H:MM:SS or MM:SS string."""
    h = total // 3600
    remainder = total % 3600
    m = remainder // 60
    s = remainder % 60
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def format_pace(time_seconds: int, distance_m: int) -> str:
    """Return average pace as 'M:SS /km'."""
    if distance_m <= 0:
        return "--"
    pace = time_seconds / (distance_m / 1000)
    mins = int(pace // 60)
    secs = int(pace % 60)
    return f"{mins}:{secs:02d}"

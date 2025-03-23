import pandas as pd
import re
import sys
import os


def standardize_name(name):
    """
    Standardizes product names by extracting dimensions, material, type, and features.
    """
    if not isinstance(name, str):
        return name  # Return as is if not a string

    # Extract thickness, width, and length
    dimensions = re.findall(r'(\d+\/\d+|\d+\.?\d*)\s*[-"]?\s*(inch|in|ft|feet|mm|cm|")?', name, re.I)

    # Extract material and type
    materials = ["Birch", "Pine", "Maple", "Oak", "Walnut", "Mahogany", "Spruce",
                 "Cedar", "Fir", "Aspen", "Poplar", "HDF", "MDF", "OSB", "Hardboard",
                 "Melamine", "Particle Board"]

    types = ["Plywood", "Handy Panel", "Pegboard", "Slotwall", "Sheathing"]

    material = next((m for m in materials if m.lower() in name.lower()), "")
    product_type = next((t for t in types if t.lower() in name.lower()), "Plywood")

    # Extract additional features
    features = set()
    if "Sanded" in name: features.add("Sanded")
    if "Fire Retardant" in name: features.add("Fire Retardant")
    if "Pressure Treated" in name: features.add("Pressure Treated")
    if "Melamine" in name:
        color_match = re.search(r"Melamine\s*-\s*(\w+)", name, re.I)
        color = color_match.group(1) if color_match else "Melamine"
        if color != material:
            features.add(f"Melamine - {color}")
    if "Tongue & Groove" in name or "T&G" in name: features.add("Tongue & Groove")
    if "Handy Panel" in name: features.add("Handy Panel")

    # Construct standardized name
    size_part = " x ".join([f"{d[0]}-{d[1]}" if d[1] else d[0] for d in dimensions])
    standardized_name = f"{size_part} {material} {product_type}".strip()

    if features:
        standardized_name += " - " + " ".join(sorted(features))

    return standardized_name


def reorder_and_clean_csv(input_path):
    """
    Reads, standardizes, sorts, and writes a sorted CSV file dynamically.
    """
    if not os.path.exists(input_path):
        print(f"Error: File '{input_path}' not found.")
        return

    # Determine the output file path
    output_path = input_path.replace("Unsorted", "Sorted")

    try:
        # Read the CSV
        df = pd.read_csv(input_path)

        if "Product Name" not in df.columns or "Price" not in df.columns:
            print("Error: CSV is missing required columns ('Product Name', 'Price').")
            return

        # Apply standardization and sort
        df["Standardized Name"] = df["Product Name"].apply(standardize_name)
        df = df.sort_values("Standardized Name")

        # Save to output CSV
        df[["Standardized Name", "Price"]].to_csv(output_path, index=False, quoting=1)

        print(f"Sorted file created: {output_path}")

    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sortProductsPLY.py <input_csv_path>")
    else:
        reorder_and_clean_csv(sys.argv[1])
